import React, { useState, useCallback, useRef } from 'react';
import { AssetData, ReportData, CorrelationMatrix, NetworkData, StressTestConfig } from './types';
import { calculateInitialMetrics, runNetworkAndPortfolioAnalysis } from './services/financialCalculations';
import { getExecutiveSummary } from './services/geminiService';
import { generatePdfReport, printElement } from './utils/reportGenerator';
import { Report } from './components/Report';
import { Loader } from './components/Loader';
import { SettingsPanel } from './components/SettingsPanel';
import { CorrelationMatrixView } from './components/CorrelationMatrix';
import { NetworkVisualization } from './components/NetworkVisualization';
import { PortfolioDetailsView } from './components/PortfolioDetailsView';
import { CentralityView } from './components/CentralityView';
import { BacktestView } from './components/BacktestView';
import { DownloadCsvMenu } from './components/DownloadCsvMenu';
import { StressComparisonBanner } from './components/StressComparisonBanner';

type View = 'report' | 'backtest' | 'portfolio' | 'correlation' | 'network' | 'centrality';

const DEFAULT_STRESS_CONFIG: StressTestConfig = {
  enabled: false,
  volatilityMultiplier: 1.5,
  correlationShock: 0.15,
  marketDriftShock: -0.05,
  targetUniverse: 'All',
  selectedPresetId: 'vol-spike-mild',
};

const App: React.FC = () => {
  // Core Data State (Base Historical)
  const [assets, setAssets] = useState<AssetData[]>([]);
  const [correlationMatrix, setCorrelationMatrix] = useState<CorrelationMatrix | null>(null);
  
  // Settings & Parameters State
  const [correlationThreshold, setCorrelationThreshold] = useState<number>(0.3);
  const [stressConfig, setStressConfig] = useState<StressTestConfig>(DEFAULT_STRESS_CONFIG);

  // Derived/Display State
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [baselineReportData, setBaselineReportData] = useState<ReportData | null>(null);
  const [networkData, setNetworkData] = useState<NetworkData | null>(null);
  const [activeAssets, setActiveAssets] = useState<AssetData[]>([]);
  const [activeMatrix, setActiveMatrix] = useState<CorrelationMatrix | null>(null);

  const [loading, setLoading] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<View>('report');

  const resetState = () => {
    setAssets([]);
    setCorrelationMatrix(null);
    setReportData(null);
    setBaselineReportData(null);
    setNetworkData(null);
    setActiveAssets([]);
    setActiveMatrix(null);
    setError(null);
    setStressConfig(DEFAULT_STRESS_CONFIG);
    setCurrentView('report');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    resetState();

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split(/\r\n|\n/).filter(line => line.trim() !== '');
        if (lines.length < 2) throw new Error("CSV must have at least a header and one data row.");
        
        const headers = lines[0].split(',').map(h => h.trim()).slice(1);
        const pricesByAsset: Record<string, number[]> = {};
        headers.forEach(h => { if (h) pricesByAsset[h] = []; });
        const dateLabels: string[] = [];

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',');
          const dateVal = values[0]?.trim();
          if (dateVal) dateLabels.push(dateVal);
          headers.forEach((h, idx) => {
            if (h && values[idx + 1]) {
              const val = parseFloat(values[idx + 1]);
              if (!isNaN(val) && val > 0) pricesByAsset[h].push(val);
            }
          });
        }

        const initialData = Object.entries(pricesByAsset)
          .map(([symbol, prices]) => ({ symbol, prices, returns: [], dateLabels }))
          .filter(d => d.prices.length > 2);

        if (initialData.length < 2) throw new Error("Not enough valid asset data to perform analysis.");

        await performInitialAnalysis(initialData, dateLabels);

      } catch (err: any) {
        console.error("Processing failed:", err);
        setError(err.message || "Failed to process the uploaded file. Please check the format.");
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };
  
  const performInitialAnalysis = async (data: Omit<AssetData, 'returns'>[], dateLabels: string[] = []) => {
      const { assetsWithReturns, matrix } = calculateInitialMetrics(data, dateLabels);
      setAssets(assetsWithReturns);
      setCorrelationMatrix(matrix);
      setActiveAssets(assetsWithReturns);
      setActiveMatrix(matrix);
      await performSubsequentAnalysis(assetsWithReturns, matrix, correlationThreshold, stressConfig);
  };

  const performSubsequentAnalysis = async (
    currentAssets: AssetData[],
    matrix: CorrelationMatrix,
    threshold: number,
    currentStressConfig: StressTestConfig
  ) => {
    if (currentAssets.length === 0 || !matrix) return;
    setLoading(true);
    try {
      const { portfolios, network, stressedAssets, stressedMatrix } = runNetworkAndPortfolioAnalysis(
        currentAssets,
        matrix,
        threshold,
        currentStressConfig
      );

      if (portfolios.length === 0) {
        throw new Error("Could not generate portfolio results.");
      }
      
      const coreAssetCount = portfolios.find(p => p.universe === 'Core')?.weights
        ? Object.keys(portfolios.find(p => p.universe === 'Core')!.weights).length
        : 0;
      const peripheryAssetCount = portfolios.find(p => p.universe === 'Periphery')?.weights
        ? Object.keys(portfolios.find(p => p.universe === 'Periphery')!.weights).length
        : 0;

      // Executive summary generation
      const summary = await getExecutiveSummary(portfolios, currentAssets.length, coreAssetCount, peripheryAssetCount);
      
      const newReportData: ReportData = {
        portfolios,
        summary,
        totalAssets: currentAssets.length,
        coreAssets: coreAssetCount,
        peripheralAssets: peripheryAssetCount,
      };

      setReportData(newReportData);
      setNetworkData(network);
      setActiveAssets(stressedAssets || currentAssets);
      setActiveMatrix(stressedMatrix || matrix);

      // Save baseline report if not stressed, for comparisons
      if (!currentStressConfig.enabled) {
        setBaselineReportData(newReportData);
      }

    } catch (err: any) {
      console.error("Analysis failed:", err);
      setError(err.message || "An unexpected error occurred during analysis.");
    } finally {
      setLoading(false);
    }
  };

  const handleThresholdChange = (newThreshold: number) => {
    setCorrelationThreshold(newThreshold);
    if (assets.length > 0 && correlationMatrix) {
      performSubsequentAnalysis(assets, correlationMatrix, newThreshold, stressConfig);
    }
  };

  // Real-time stress test configuration update
  const handleStressConfigChange = (newStressConfig: StressTestConfig) => {
    setStressConfig(newStressConfig);
    if (assets.length > 0 && correlationMatrix) {
      performSubsequentAnalysis(assets, correlationMatrix, correlationThreshold, newStressConfig);
    }
  };

  const handleResetStressTest = () => {
    const disabledConfig: StressTestConfig = {
      ...stressConfig,
      enabled: false,
    };
    setStressConfig(disabledConfig);
    if (assets.length > 0 && correlationMatrix) {
      performSubsequentAnalysis(assets, correlationMatrix, correlationThreshold, disabledConfig);
    }
  };

  const generateSampleData = () => {
    setLoading(true);
    resetState();
    const tickers = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'JPM', 'V', 'PG', 'JNJ', 'XOM', 'WMT', 'BAC', 'CVX'];
    
    // Generate sequential trading day date labels for realistic time series backtesting
    const numDays = 121;
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() - Math.floor(numDays * 1.45)); // Approx 6 months ago
    const dateLabels: string[] = [];
    const cur = new Date(baseDate);

    while (dateLabels.length < numDays) {
      const day = cur.getDay();
      if (day !== 0 && day !== 6) {
        dateLabels.push(cur.toISOString().slice(0, 10));
      }
      cur.setDate(cur.getDate() + 1);
    }

    const sample = tickers.map(t => {
      const prices = [100 + Math.random() * 20];
      for (let i = 0; i < 120; i++) {
        const r = (Math.random() - 0.49) * 0.06;
        prices.push(Math.max(1, prices[prices.length - 1] * (1 + r)));
      }
      return { symbol: t, prices, dateLabels };
    });
    performInitialAnalysis(sample, dateLabels);
  };
  
  const handleExportPdf = async () => {
    if (!reportData || isExportingPdf) return;

    setIsExportingPdf(true);
    const originalView = currentView;
    setCurrentView('report');

    await new Promise(resolve => setTimeout(resolve, 100));

    const reportElement = document.querySelector('.report-container');
    if (reportElement) {
        try {
            await generatePdfReport(reportElement as HTMLElement);
        } catch (error) {
            console.error("Failed to generate PDF:", error);
            setError("Could not generate the PDF report. Please try again.");
        }
    }

    setCurrentView(originalView);
    setIsExportingPdf(false);
  };

  const handlePrint = async () => {
    if (!reportData) return;

    const originalView = currentView;
    if (currentView !== 'report') {
      setCurrentView('report');
      await new Promise(resolve => setTimeout(resolve, 150));
    }

    const reportElement = document.querySelector('.report-container');
    if (reportElement) {
      printElement(reportElement as HTMLElement, 'TMFG Comparative Analysis Report');
    } else {
      window.print();
    }

    if (originalView !== 'report') {
      setTimeout(() => setCurrentView(originalView), 500);
    }
  };

  const renderView = () => {
    if (!reportData || !correlationMatrix || !networkData) return null;
    switch(currentView) {
      case 'report':
        return (
          <Report
            data={reportData}
            assets={activeAssets}
            networkData={networkData}
            threshold={correlationThreshold}
          />
        );
      case 'backtest':
        return (
          <BacktestView
            portfolios={reportData.portfolios}
            assets={activeAssets}
            stressConfig={stressConfig}
          />
        );
      case 'portfolio':
        return (
          <PortfolioDetailsView
            portfolios={reportData.portfolios}
            assets={activeAssets}
            stressConfig={stressConfig}
          />
        );
      case 'correlation':
        return (
          <CorrelationMatrixView
            matrix={activeMatrix || correlationMatrix}
            symbols={assets.map(a => a.symbol)}
          />
        );
      case 'network':
        return (
          <NetworkVisualization
            network={networkData}
            assets={activeAssets}
            stressConfig={stressConfig}
          />
        );
      case 'centrality':
        return (
          <CentralityView
            network={networkData}
            assets={activeAssets}
            reportData={reportData}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans">
      <header className="bg-slate-900 text-white shadow-lg sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-xl shrink-0">QN</div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Interactive TMFG Analysis</h1>
              {stressConfig.enabled && (
                <span className="text-[11px] text-amber-400 font-medium flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping inline-block" />
                  Live Stress Test Mode: {stressConfig.volatilityMultiplier}x Volatility
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-3 items-center justify-center md:justify-end">
            <label className="text-xs text-center bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-lg cursor-pointer transition-colors border border-slate-700">
              Upload Price CSV
              <input type="file" className="hidden" onChange={handleFileUpload} accept=".csv" />
            </label>
            <button
              onClick={generateSampleData}
              className="text-xs bg-blue-600 hover:bg-blue-500 px-3 py-2 rounded-lg font-semibold transition-colors shadow-md cursor-pointer"
            >
              Load Sample
            </button>
            <DownloadCsvMenu
              assets={activeAssets}
              networkData={networkData}
              reportData={reportData}
              threshold={correlationThreshold}
              disabled={!reportData || loading}
            />
            <button
              id="export-pdf-button"
              onClick={handleExportPdf}
              disabled={!reportData || loading || isExportingPdf}
              className="text-xs bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-lg transition-colors border border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isExportingPdf ? 'Exporting...' : 'Export PDF'}
            </button>
            <button
              id="print-button"
              onClick={handlePrint}
              disabled={!reportData || loading}
              className="text-xs bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-lg transition-colors border border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              Print Report
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 md:p-8">
        {!reportData && !loading && !error && (
            <div className="flex-1 min-h-[400px] flex flex-col items-center justify-center bg-white rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center animate-fade-in">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-3xl">🚀</div>
                <h2 className="text-xl font-bold text-slate-800">Quantitative Analysis Dashboard</h2>
                <p className="text-slate-500 mt-2 max-w-sm">Upload a CSV file or use the sample data to begin your interactive analysis.</p>
            </div>
        )}

        {loading && !reportData && (
          <div className="flex flex-col items-center justify-center h-96">
            <Loader />
            <p className="text-slate-500 mt-4">Performing Initial Quantitative Analysis...</p>
          </div>
        )}

        {error && !loading && (
          <div className="bg-red-50 border border-red-200 text-red-800 p-6 rounded-lg text-center">
            <h3 className="font-bold mb-2">Analysis Failed</h3>
            <p className="text-sm">{error}</p>
          </div>
        )}

        {reportData && (
          <div className="space-y-6 animate-fade-in">
            {/* Real-time Settings Panel with Stress Testing Mode */}
            <SettingsPanel
              threshold={correlationThreshold}
              onThresholdChange={handleThresholdChange}
              assetCounts={{ total: assets.length, core: reportData.coreAssets, peripheral: reportData.peripheralAssets }}
              loading={loading}
              stressConfig={stressConfig}
              onStressConfigChange={handleStressConfigChange}
              onResetStressTest={handleResetStressTest}
            />

            {/* Live Stress Test Active Indicator & Overview Banner */}
            <StressComparisonBanner
              stressConfig={stressConfig}
              baselinePortfolios={baselineReportData?.portfolios}
              currentPortfolios={reportData.portfolios}
              onReset={handleResetStressTest}
            />
            
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200">
              <div className="border-b border-slate-200 p-2">
                  <nav className="flex flex-wrap gap-1">
                      {(['report', 'backtest', 'portfolio', 'correlation', 'network', 'centrality'] as View[]).map(view => (
                          <button
                              key={view}
                              onClick={() => setCurrentView(view)}
                              className={`px-4 py-2 text-sm font-semibold rounded-lg capitalize transition-colors cursor-pointer ${
                                currentView === view ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
                              }`}
                          >
                              {view === 'backtest'
                                ? 'Backtest'
                                : view === 'correlation'
                                ? 'Correlation'
                                : view === 'network'
                                ? 'Network Graph'
                                : view === 'centrality'
                                ? 'Centrality'
                                : view === 'portfolio'
                                ? 'Portfolios'
                                : 'Report'}
                          </button>
                      ))}
                  </nav>
              </div>
              <div className="p-4 sm:p-8 md:p-12 report-container">{renderView()}</div>
            </div>
          </div>
        )}
      </main>

      <footer className="max-w-4xl mx-auto p-8 mt-4 text-center">
        <p className="text-slate-400 text-xs">Models: 1/N, Mean-Variance (Heuristic), Risk Parity (Heuristic), CVaR (Heuristic)</p>
      </footer>
    </div>
  );
};

export default App;
