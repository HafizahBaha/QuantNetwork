import React, { useState } from 'react';
import { Sliders, Flame, ChevronDown, ChevronUp } from 'lucide-react';
import { StressTestConfig } from '../types';
import { StressTestPanel } from './StressTestPanel';

interface SettingsPanelProps {
  threshold: number;
  onThresholdChange: (value: number) => void;
  assetCounts: {
    total: number;
    core: number;
    peripheral: number;
  };
  loading: boolean;
  stressConfig: StressTestConfig;
  onStressConfigChange: (config: StressTestConfig) => void;
  onResetStressTest: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  threshold,
  onThresholdChange,
  assetCounts,
  loading,
  stressConfig,
  onStressConfigChange,
  onResetStressTest,
}) => {
  const [activeTab, setActiveTab] = useState<'network' | 'stress'>('network');
  const [isStressCollapsed, setIsStressCollapsed] = useState(false);

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
      {/* Top Header / Mode Switcher */}
      <div className="border-b border-slate-200 bg-slate-50/80 px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg bg-slate-200/80 p-0.5">
            <button
              type="button"
              id="settings-tab-network"
              onClick={() => setActiveTab('network')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                activeTab === 'network'
                  ? 'bg-white text-slate-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 text-blue-600" />
              TMFG Graph Settings
            </button>
            <button
              type="button"
              id="settings-tab-stress"
              onClick={() => setActiveTab('stress')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                activeTab === 'stress'
                  ? 'bg-white text-slate-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Flame className={`w-3.5 h-3.5 ${stressConfig.enabled ? 'text-amber-600' : 'text-slate-500'}`} />
              Stress Test Engine
              {stressConfig.enabled && (
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping inline-block ml-0.5" />
              )}
            </button>
          </div>
        </div>

        {/* Global Asset Counts Summary */}
        <div className="flex items-center gap-4 text-xs">
          <div>
            <span className="text-slate-500 mr-1.5">Universe:</span>
            <span className="font-bold text-slate-800">{assetCounts.total} Assets</span>
          </div>
          <div>
            <span className="text-red-500 font-semibold mr-1.5">Core (30%):</span>
            <span className="font-bold text-red-600">{assetCounts.core}</span>
          </div>
          <div>
            <span className="text-blue-500 font-semibold mr-1.5">Periphery (30%):</span>
            <span className="font-bold text-blue-600">{assetCounts.peripheral}</span>
          </div>
          {loading && (
            <div className="flex items-center gap-1.5 text-blue-600">
              <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
              <span className="text-[11px] font-medium">Recalculating...</span>
            </div>
          )}
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Active Tab: Network Parameters */}
        {activeTab === 'network' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <div className="col-span-1">
              <div className="flex justify-between items-center mb-2">
                <label htmlFor="threshold-slider" className="block text-sm font-semibold text-slate-700">
                  Correlation Threshold (|ρ| cut-off)
                </label>
                <span className="font-mono text-xs font-semibold bg-slate-100 text-slate-800 px-2.5 py-1 rounded-md border border-slate-200">
                  {threshold.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <input
                  id="threshold-slider"
                  type="range"
                  min="0.05"
                  max="0.95"
                  step="0.05"
                  value={threshold}
                  onChange={(e) => onThresholdChange(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Determines which correlation edges are admitted into the planar triangulated maximal graph.
              </p>
            </div>

            <div className="col-span-1 border-t md:border-t-0 md:border-l border-slate-200 pt-4 md:pt-0 md:pl-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-slate-700">Stress Test Status</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {stressConfig.enabled
                      ? `Active: ${stressConfig.volatilityMultiplier}x Volatility, ${stressConfig.correlationShock > 0 ? `+${stressConfig.correlationShock}` : stressConfig.correlationShock} Corr Shock`
                      : 'Inactive (Baseline market conditions)'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('stress')}
                  className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                    stressConfig.enabled
                      ? 'bg-amber-100 text-amber-900 hover:bg-amber-200 border border-amber-300'
                      : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                  }`}
                >
                  {stressConfig.enabled ? 'Adjust Stress Panel →' : 'Launch Stress Test →'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab: Stress Testing Engine (or visible directly if activeTab is 'stress') */}
        {activeTab === 'stress' && (
          <StressTestPanel
            config={stressConfig}
            onChange={onStressConfigChange}
            onReset={onResetStressTest}
            disabled={loading}
          />
        )}
      </div>
    </div>
  );
};
