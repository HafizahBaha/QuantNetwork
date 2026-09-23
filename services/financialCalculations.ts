import { AssetData, NetworkNode, NetworkEdge, PortfolioResult, Universe, CorrelationMatrix, NetworkData, StressTestConfig, BacktestDataPoint, BacktestSummary } from '../types';

// --- MATH & STATS HELPERS ---
const getMean = (data: number[]): number => data.reduce((a, b) => a + b, 0) / data.length;
const getStdDev = (data: number[]): number => {
  const mean = getMean(data);
  const sqDiff = data.map(d => Math.pow(d - mean, 2));
  return Math.sqrt(getMean(sqDiff));
};
const getCovariance = (returns1: number[], returns2: number[]): number => {
  const mean1 = getMean(returns1);
  const mean2 = getMean(returns2);
  let cov = 0;
  for (let k = 0; k < returns1.length; k++) {
    cov += (returns1[k] - mean1) * (returns2[k] - mean2);
  }
  return cov / returns1.length;
};
const getCorrelation = (returns1: number[], returns2: number[]): number => {
  const cov = getCovariance(returns1, returns2);
  const std1 = getStdDev(returns1);
  const std2 = getStdDev(returns2);
  return (std1 > 0 && std2 > 0) ? cov / (std1 * std2) : 0;
};

// --- ONE-TIME CALCULATIONS ---
function pricesToLogReturns(assets: Omit<AssetData, 'returns'>[], dateLabels: string[] = []): AssetData[] {
  return assets.map(asset => {
    const returns: number[] = [];
    for (let j = 1; j < asset.prices.length; j++) {
      returns.push(Math.log(asset.prices[j] / asset.prices[j - 1]));
    }
    const dates = asset.dateLabels && asset.dateLabels.length > 0 ? asset.dateLabels : dateLabels;
    return { ...asset, returns, dateLabels: dates };
  }).filter(a => a.returns.length > 0);
}

function calculateCorrelationMatrix(assets: AssetData[]): CorrelationMatrix {
    const n = assets.length;
    const matrix: CorrelationMatrix = Array(n).fill(0).map(() => Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        const corr = getCorrelation(assets[i].returns, assets[j].returns);
        matrix[i][j] = matrix[j][i] = corr;
      }
    }
    return matrix;
}

export function calculateInitialMetrics(priceData: Omit<AssetData, 'returns'>[], dateLabels: string[] = []) {
    const assetsWithReturns = pricesToLogReturns(priceData, dateLabels);
    const matrix = calculateCorrelationMatrix(assetsWithReturns);
    return { assetsWithReturns, matrix };
}


// --- DYNAMIC CALCULATIONS (THRESHOLD-DEPENDENT) ---
function computeNetwork(assets: AssetData[], correlationMatrix: CorrelationMatrix, threshold: number, splitRatio: number = 0.3): NetworkData & { coreAssetSymbols: string[], peripheralAssetSymbols: string[] } {
  if (assets.length < 2) {
    const nodes = assets.map(a => ({ id: a.symbol, degree: 0, closeness: 0, betweenness: 0, peripheralityScore: 1 }));
    return { nodes, edges: [], coreAssetSymbols: [], peripheralAssetSymbols: assets.map(a => a.symbol) };
  }
  
  const n = assets.length;
  const adj: Map<string, string[]> = new Map();
  const edges: NetworkEdge[] = [];
  assets.forEach(a => adj.set(a.symbol, []));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const correlation = correlationMatrix[i][j];
      if (Math.abs(correlation) >= threshold) {
        adj.get(assets[i].symbol)!.push(assets[j].symbol);
        adj.get(assets[j].symbol)!.push(assets[i].symbol);
        edges.push({ source: assets[i].symbol, target: assets[j].symbol, weight: correlation });
      }
    }
  }

  const nodesWithoutScore: Omit<NetworkNode, 'peripheralityScore'>[] = assets.map(asset => {
    const symbol = asset.symbol;
    const degree = adj.get(symbol)?.length || 0;
    
    let totalDistance = 0;
    const q: [string, number][] = [[symbol, 0]];
    const visited = new Map([[symbol, 0]]);
    while(q.length > 0) {
        const [curr, dist] = q.shift()!;
        totalDistance += dist;
        (adj.get(curr) || []).forEach(neighbor => {
            if(!visited.has(neighbor)) {
                visited.set(neighbor, dist + 1);
                q.push([neighbor, dist + 1]);
            }
        });
    }
    const closeness = totalDistance > 0 ? (visited.size - 1) / totalDistance : 0;
    return { id: symbol, degree, closeness, betweenness: 0 };
  });

  if(nodesWithoutScore.length === 0) return { nodes: [], edges: [], coreAssetSymbols: [], peripheralAssetSymbols: [] };
  
  const maxDegree = Math.max(...nodesWithoutScore.map(n => n.degree), 1);
  const maxCloseness = Math.max(...nodesWithoutScore.map(n => n.closeness), 1);

  const scoredNodes: NetworkNode[] = nodesWithoutScore.map(n => {
    const normDegree = n.degree / maxDegree;
    const normCloseness = n.closeness / maxCloseness;
    const peripheralityScore = ((1 - normDegree) + (1 - normCloseness)) / 2;
    return { ...n, peripheralityScore };
  });

  const sortedByPeripherality = [...scoredNodes].sort((a, b) => b.peripheralityScore - a.peripheralityScore);
  const splitCount = Math.ceil(assets.length * splitRatio);
  
  const peripheralAssetSymbols = sortedByPeripherality.slice(0, splitCount).map(n => n.id);
  const coreAssetSymbols = sortedByPeripherality.slice(sortedByPeripherality.length - splitCount).map(n => n.id);
  
  return { nodes: scoredNodes, edges, coreAssetSymbols, peripheralAssetSymbols };
}

// --- PORTFOLIO METRICS & OPTIMIZATION ---
function calculatePortfolioMetrics(model: string, universe: Universe, weights: Record<string, number>, assets: AssetData[]): PortfolioResult {
  if (assets.length === 0 || assets[0].returns.length === 0) {
      return { model, universe, weights, expectedReturn: 0, volatility: 0, sharpeRatio: 0, maxDrawdown: 0, cvar: 0, cumulativeReturns: [{date: 0, value: 1}] };
  }
  const portfolioReturns: number[] = [];
  const numPeriods = assets[0].returns.length;
  
  for(let i = 0; i < numPeriods; i++) {
    let periodReturn = 0;
    for (const symbol in weights) {
        const asset = assets.find(a => a.symbol === symbol);
        if (asset && asset.returns[i] !== undefined) {
          periodReturn += weights[symbol] * asset.returns[i];
        }
    }
    portfolioReturns.push(periodReturn);
  }

  const tradingDays = 252;
  const riskFreeRate = 0.02;

  const meanReturn = getMean(portfolioReturns);
  const volatility = getStdDev(portfolioReturns);

  const annualizedReturn = meanReturn * tradingDays;
  const annualizedVolatility = volatility * Math.sqrt(tradingDays);
  
  const sharpeRatio = annualizedVolatility > 0
    ? (annualizedReturn - riskFreeRate) / annualizedVolatility
    : 0;

  const cumulativeReturns: {date: number, value: number}[] = [{date: 0, value: 1}];
  let peak = 1;
  let maxDrawdown = 0;
  portfolioReturns.forEach((r, i) => {
    const nextValue = cumulativeReturns[i].value * (1 + r);
    cumulativeReturns.push({date: i + 1, value: nextValue});
    peak = Math.max(peak, nextValue);
    const drawdown = (peak - nextValue) / peak;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
  });
  
  const sortedReturns = [...portfolioReturns].sort((a, b) => a - b);
  const cvarIndex = Math.floor(sortedReturns.length * 0.05);
  const tailReturns = sortedReturns.slice(0, cvarIndex);
  const cvar = tailReturns.length > 0 ? Math.abs(getMean(tailReturns)) : 0;

  return { model, universe, weights, expectedReturn: annualizedReturn, volatility: annualizedVolatility, sharpeRatio, maxDrawdown, cvar, cumulativeReturns };
}

function getWeights(model: string, assets: AssetData[]): Record<string, number> {
  const symbols = assets.map(a => a.symbol);
  const weights: Record<string, number> = {};
  if (symbols.length === 0) return weights;

  switch(model) {
    case '1/N (Benchmark)':
    case 'Mean-Variance': // Heuristic: Inverse Volatility
    case 'Risk Parity': // Heuristic: Inverse Volatility
      const volatilities = assets.map(a => getStdDev(a.returns));
      const invVolatilities = volatilities.map(v => v > 0 ? 1 / v : 0);
      const sumInvVol = invVolatilities.reduce((sum, val) => sum + val, 0);
      if (sumInvVol === 0) {
        symbols.forEach(s => weights[s] = 1 / symbols.length);
        return weights;
      }
      symbols.forEach((s, i) => weights[s] = invVolatilities[i] / sumInvVol);
      return weights;
    case 'CVaR': // Heuristic: Random Search
      let bestWeights: Record<string, number> = {};
      let minCvar = Infinity;
      if (assets.length === 0 || assets[0].returns.length === 0) return weights;

      // Initialize with 1/N
      symbols.forEach(s => bestWeights[s] = 1 / symbols.length);

      for (let i = 0; i < 500; i++) { // Reduced iterations for performance
        const randomNumbers = symbols.map(() => Math.random());
        const sumRandom = randomNumbers.reduce((sum, val) => sum + val, 0);
        const currentWeights: Record<string, number> = {};
        symbols.forEach((s, j) => currentWeights[s] = randomNumbers[j] / sumRandom);
        
        const tempPortfolioReturns: number[] = [];
        for (let p = 0; p < assets[0].returns.length; p++) {
            let periodReturn = 0;
            assets.forEach(a => periodReturn += currentWeights[a.symbol] * a.returns[p]);
            tempPortfolioReturns.push(periodReturn);
        }
        const sortedReturns = [...tempPortfolioReturns].sort((a, b) => a - b);
        const cvarIndex = Math.floor(sortedReturns.length * 0.05);
        const tailReturns = sortedReturns.slice(0, cvarIndex);
        const currentCvar = tailReturns.length > 0 ? Math.abs(getMean(tailReturns)) : 0;
        
        if (currentCvar < minCvar) {
          minCvar = currentCvar;
          bestWeights = currentWeights;
        }
      }
      return bestWeights;
    default:
      symbols.forEach(s => weights[s] = 1 / symbols.length);
      return weights;
  }
}

// --- STRESS TESTING TRANSFORMATION ---
export function applyStressTest(
  assets: AssetData[],
  baseCorrelationMatrix: CorrelationMatrix,
  stressConfig: StressTestConfig,
  coreSymbols: string[] = []
): { stressedAssets: AssetData[]; stressedCorrelationMatrix: CorrelationMatrix } {
  if (!stressConfig.enabled) {
    return { stressedAssets: assets, stressedCorrelationMatrix: baseCorrelationMatrix };
  }

  const { volatilityMultiplier, correlationShock, marketDriftShock, targetUniverse } = stressConfig;
  const coreSet = new Set(coreSymbols);

  // 1. Transform Asset Returns
  const stressedAssets: AssetData[] = assets.map(asset => {
    const isCore = coreSet.has(asset.symbol);
    
    // Determine effective multiplier for this asset based on target universe
    let effectiveVolMultiplier = volatilityMultiplier;
    let effectiveDrift = marketDriftShock;

    if (targetUniverse === 'Core') {
      // Core assets bear higher stress (100% of shock), periphery assets bear less (40%)
      effectiveVolMultiplier = isCore ? volatilityMultiplier : 1 + (volatilityMultiplier - 1) * 0.4;
      effectiveDrift = isCore ? marketDriftShock : marketDriftShock * 0.4;
    } else if (targetUniverse === 'Periphery') {
      // Periphery bears higher stress
      effectiveVolMultiplier = !isCore ? volatilityMultiplier : 1 + (volatilityMultiplier - 1) * 0.4;
      effectiveDrift = !isCore ? marketDriftShock : marketDriftShock * 0.4;
    }

    const meanReturn = getMean(asset.returns);
    const dailyDrift = effectiveDrift / 252; // Convert annual shock to per-period drift

    // Returns centered around mean, scaled by volatility shock, with drift added
    const stressedReturns = asset.returns.map(r => {
      const deviation = r - meanReturn;
      return (meanReturn + dailyDrift) + deviation * effectiveVolMultiplier;
    });

    // Reconstruct prices from stressed returns for consistency
    const initialPrice = asset.prices[0] || 100;
    const stressedPrices = [initialPrice];
    for (let i = 0; i < stressedReturns.length; i++) {
      stressedPrices.push(Math.max(0.01, stressedPrices[i] * Math.exp(stressedReturns[i])));
    }

    return {
      ...asset,
      returns: stressedReturns,
      prices: stressedPrices,
    };
  });

  // 2. Adjust Correlation Matrix (Systemic contagion / correlation spike during crises)
  const n = baseCorrelationMatrix.length;
  const stressedCorrelationMatrix: CorrelationMatrix = Array(n).fill(0).map(() => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        stressedCorrelationMatrix[i][j] = 1.0;
      } else {
        const baseCorr = baseCorrelationMatrix[i][j];
        // During market panic, correlations typically converge towards 1.0 (loss of diversification)
        let shockedCorr = baseCorr;
        if (correlationShock > 0) {
          shockedCorr = baseCorr + (1 - baseCorr) * (correlationShock / 1.0);
        } else if (correlationShock < 0) {
          // Negative correlation shock (decorrelation regime)
          shockedCorr = baseCorr * (1 + correlationShock);
        }
        stressedCorrelationMatrix[i][j] = Math.max(-0.99, Math.min(0.99, shockedCorr));
      }
    }
  }

  return { stressedAssets, stressedCorrelationMatrix };
}

// --- MAIN ORCHESTRATOR FOR DYNAMIC ANALYSIS ---
export function runNetworkAndPortfolioAnalysis(
  allAssets: AssetData[],
  correlationMatrix: CorrelationMatrix,
  threshold: number,
  stressConfig?: StressTestConfig
) {
  // If stress testing is active, apply the market shocks
  let workingAssets = allAssets;
  let workingMatrix = correlationMatrix;

  if (stressConfig?.enabled) {
    // Preliminary run without stress to establish baseline core/periphery classification if needed
    const baselineNetwork = computeNetwork(allAssets, correlationMatrix, threshold);
    const stressed = applyStressTest(allAssets, correlationMatrix, stressConfig, baselineNetwork.coreAssetSymbols);
    workingAssets = stressed.stressedAssets;
    workingMatrix = stressed.stressedCorrelationMatrix;
  }

  const results: PortfolioResult[] = [];
  
  // 1. Benchmark
  const benchmarkWeights = workingAssets.reduce((acc, a) => ({...acc, [a.symbol]: 1 / workingAssets.length}), {});
  results.push(calculatePortfolioMetrics('1/N (Benchmark)', 'Full', benchmarkWeights, workingAssets));
  
  // 2. Network Filtering on (potentially stressed) network
  const { nodes, edges, coreAssetSymbols, peripheralAssetSymbols } = computeNetwork(workingAssets, workingMatrix, threshold);
  const coreAssets = workingAssets.filter(a => coreAssetSymbols.includes(a.symbol));
  const peripheralAssets = workingAssets.filter(a => peripheralAssetSymbols.includes(a.symbol));

  // 3. Run models on all universes
  const modelsToRun = ['Mean-Variance', 'Risk Parity', 'CVaR'];
  const universes: { name: Universe, assets: AssetData[] }[] = [
      { name: 'Full', assets: workingAssets },
      { name: 'Core', assets: coreAssets },
      { name: 'Periphery', assets: peripheralAssets }
  ];
  
  for (const model of modelsToRun) {
    for (const uni of universes) {
        if (uni.assets.length > 0) {
            const weights = getWeights(model, uni.assets);
            results.push(calculatePortfolioMetrics(model, uni.name, weights, workingAssets));
        }
    }
  }

  return { 
    portfolios: results, 
    network: { nodes, edges },
    stressedAssets: workingAssets,
    stressedMatrix: workingMatrix
  };
}

// --- HISTORICAL FULL-DURATION BACKTEST ENGINE ---
export function calculateBacktest(
  benchmarkPortfolio: PortfolioResult,
  strategyPortfolio: PortfolioResult,
  assets: AssetData[],
  dateLabels: string[] = []
): { series: BacktestDataPoint[]; summary: BacktestSummary } {
  const tradingDays = 252;
  const riskFreeRate = 0.02;

  if (assets.length === 0 || assets[0].returns.length === 0) {
    const emptySummary: BacktestSummary = {
      strategyName: strategyPortfolio?.model || 'Strategy',
      strategyUniverse: strategyPortfolio?.universe || 'Periphery',
      totalPeriods: 0,
      startDateLabel: '',
      endDateLabel: '',
      benchmarkFinalValue: 1,
      strategyFinalValue: 1,
      benchmarkTotalReturn: 0,
      strategyTotalReturn: 0,
      benchmarkAnnualizedReturn: 0,
      strategyAnnualizedReturn: 0,
      benchmarkAnnualizedVol: 0,
      strategyAnnualizedVol: 0,
      benchmarkSharpeRatio: 0,
      strategySharpeRatio: 0,
      benchmarkMaxDrawdown: 0,
      strategyMaxDrawdown: 0,
      alpha: 0,
      beta: 1,
      trackingError: 0,
      informationRatio: 0,
      winRate: 0,
      upCaptureRatio: 100,
      downCaptureRatio: 100,
    };
    return { series: [], summary: emptySummary };
  }

  const numPeriods = assets[0].returns.length;
  const benchmarkWeights = benchmarkPortfolio.weights;
  const strategyWeights = strategyPortfolio.weights;

  // Build daily/period return series
  const benchmarkReturns: number[] = [];
  const strategyReturns: number[] = [];

  for (let t = 0; t < numPeriods; t++) {
    let bRet = 0;
    let sRet = 0;

    for (const asset of assets) {
      const r = asset.returns[t] ?? 0;
      const bw = benchmarkWeights[asset.symbol] ?? 0;
      const sw = strategyWeights[asset.symbol] ?? 0;
      bRet += bw * r;
      sRet += sw * r;
    }

    benchmarkReturns.push(bRet);
    strategyReturns.push(sRet);
  }

  // Calculate cumulative curves starting at $1.0000
  const series: BacktestDataPoint[] = [];
  let bVal = 1.0;
  let sVal = 1.0;
  let bPeak = 1.0;
  let sPeak = 1.0;
  let bMaxDd = 0;
  let sMaxDd = 0;

  const startLabel = dateLabels[0] || 'T0';
  series.push({
    index: 0,
    label: startLabel,
    benchmarkValue: 1.0,
    strategyValue: 1.0,
    benchmarkReturn: 0,
    strategyReturn: 0,
    benchmarkDrawdown: 0,
    strategyDrawdown: 0,
  });

  for (let t = 0; t < numPeriods; t++) {
    const bR = benchmarkReturns[t];
    const sR = strategyReturns[t];

    bVal *= (1 + bR);
    sVal *= (1 + sR);

    bPeak = Math.max(bPeak, bVal);
    sPeak = Math.max(sPeak, sVal);

    const bDd = (bPeak - bVal) / bPeak;
    const sDd = (sPeak - sVal) / sPeak;

    bMaxDd = Math.max(bMaxDd, bDd);
    sMaxDd = Math.max(sMaxDd, sDd);

    const label = dateLabels[t + 1] || `T+${t + 1}`;

    series.push({
      index: t + 1,
      label,
      benchmarkValue: bVal,
      strategyValue: sVal,
      benchmarkReturn: bR,
      strategyReturn: sR,
      benchmarkDrawdown: bDd,
      strategyDrawdown: sDd,
    });
  }

  // Statistical calculations
  const meanB = getMean(benchmarkReturns);
  const meanS = getMean(strategyReturns);
  const stdB = getStdDev(benchmarkReturns);
  const stdS = getStdDev(strategyReturns);

  const bAnnReturn = meanB * tradingDays;
  const sAnnReturn = meanS * tradingDays;
  const bAnnVol = stdB * Math.sqrt(tradingDays);
  const sAnnVol = stdS * Math.sqrt(tradingDays);

  const bSharpe = bAnnVol > 0 ? (bAnnReturn - riskFreeRate) / bAnnVol : 0;
  const sSharpe = sAnnVol > 0 ? (sAnnReturn - riskFreeRate) / sAnnVol : 0;

  // Covariance & Beta against Benchmark
  const covBS = getCovariance(strategyReturns, benchmarkReturns);
  const varB = stdB * stdB;
  const beta = varB > 0 ? covBS / varB : 1.0;
  const alpha = sAnnReturn - (riskFreeRate + beta * (bAnnReturn - riskFreeRate));

  // Tracking error & Information Ratio
  const excessReturns = strategyReturns.map((s, idx) => s - benchmarkReturns[idx]);
  const trackingErrorDaily = getStdDev(excessReturns);
  const trackingErrorAnn = trackingErrorDaily * Math.sqrt(tradingDays);
  const meanExcess = getMean(excessReturns) * tradingDays;
  const informationRatio = trackingErrorAnn > 0 ? meanExcess / trackingErrorAnn : 0;

  // Win rate (% of periods strategy outperformed benchmark)
  const winningDays = excessReturns.filter(e => e > 0).length;
  const winRate = numPeriods > 0 ? winningDays / numPeriods : 0;

  // Upside / Downside Capture Ratios
  let bUpSum = 0;
  let sUpSum = 0;
  let bDownSum = 0;
  let sDownSum = 0;

  for (let t = 0; t < numPeriods; t++) {
    if (benchmarkReturns[t] > 0) {
      bUpSum += benchmarkReturns[t];
      sUpSum += strategyReturns[t];
    } else if (benchmarkReturns[t] < 0) {
      bDownSum += benchmarkReturns[t];
      sDownSum += strategyReturns[t];
    }
  }

  const upCaptureRatio = bUpSum !== 0 ? (sUpSum / bUpSum) * 100 : 100;
  const downCaptureRatio = bDownSum !== 0 ? (sDownSum / bDownSum) * 100 : 100;

  const summary: BacktestSummary = {
    strategyName: strategyPortfolio.model,
    strategyUniverse: strategyPortfolio.universe,
    totalPeriods: numPeriods,
    startDateLabel: series[0]?.label || 'Start',
    endDateLabel: series[series.length - 1]?.label || 'End',
    benchmarkFinalValue: bVal,
    strategyFinalValue: sVal,
    benchmarkTotalReturn: bVal - 1,
    strategyTotalReturn: sVal - 1,
    benchmarkAnnualizedReturn: bAnnReturn,
    strategyAnnualizedReturn: sAnnReturn,
    benchmarkAnnualizedVol: bAnnVol,
    strategyAnnualizedVol: sAnnVol,
    benchmarkSharpeRatio: bSharpe,
    strategySharpeRatio: sSharpe,
    benchmarkMaxDrawdown: bMaxDd,
    strategyMaxDrawdown: sMaxDd,
    alpha,
    beta,
    trackingError: trackingErrorAnn,
    informationRatio,
    winRate,
    upCaptureRatio,
    downCaptureRatio,
  };

  return { series, summary };
}

