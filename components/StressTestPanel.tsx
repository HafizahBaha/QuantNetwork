import React from 'react';
import {
  Activity,
  Flame,
  AlertTriangle,
  RotateCcw,
  Sliders,
  TrendingDown,
  Layers,
  Zap,
  Info,
} from 'lucide-react';
import { StressTestConfig } from '../types';
import { STRESS_TEST_PRESETS } from '../utils/stressTestPresets';

interface StressTestPanelProps {
  config: StressTestConfig;
  onChange: (newConfig: StressTestConfig) => void;
  onReset: () => void;
  disabled?: boolean;
}

export const StressTestPanel: React.FC<StressTestPanelProps> = ({
  config,
  onChange,
  onReset,
  disabled = false,
}) => {
  const handleToggle = () => {
    onChange({
      ...config,
      enabled: !config.enabled,
    });
  };

  const handleSelectPreset = (presetId: string) => {
    const preset = STRESS_TEST_PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    onChange({
      enabled: true,
      volatilityMultiplier: preset.volatilityMultiplier,
      correlationShock: preset.correlationShock,
      marketDriftShock: preset.marketDriftShock,
      targetUniverse: preset.targetUniverse,
      selectedPresetId: preset.id,
    });
  };

  const handleParameterChange = <K extends keyof StressTestConfig>(
    key: K,
    val: StressTestConfig[K]
  ) => {
    onChange({
      ...config,
      enabled: true,
      selectedPresetId: undefined, // custom when slider touched
      [key]: val,
    });
  };

  return (
    <div
      id="tmfg-stress-test-panel"
      className={`rounded-xl border transition-all duration-200 ${
        config.enabled
          ? 'bg-amber-50/50 border-amber-300 ring-2 ring-amber-400/20'
          : 'bg-slate-50 border-slate-200'
      } p-4 sm:p-5`}
    >
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-200/80">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              config.enabled ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-600'
            }`}
          >
            <Flame className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-800">Market Stress Test Simulation</h3>
              {config.enabled && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-900 animate-pulse">
                  <Activity className="w-3 h-3 text-amber-700" />
                  ACTIVE SHOCK
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Simulate volatility spikes, correlation contagion, and drawdowns to test TMFG portfolio resilience.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {config.enabled && (
            <button
              type="button"
              id="reset-stress-test-btn"
              onClick={onReset}
              disabled={disabled}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-100 transition-colors shadow-sm cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className="w-3 h-3" />
              Reset Normal
            </button>
          )}

          <button
            type="button"
            id="toggle-stress-test-btn"
            onClick={handleToggle}
            disabled={disabled}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all shadow-sm cursor-pointer disabled:opacity-50 ${
              config.enabled
                ? 'bg-amber-600 hover:bg-amber-700 text-white ring-1 ring-amber-600'
                : 'bg-slate-800 hover:bg-slate-700 text-white'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            {config.enabled ? 'Disable Stress' : 'Enable Stress Test'}
          </button>
        </div>
      </div>

      {/* Preset Scenarios selector */}
      <div className="mt-3.5">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
            <Sliders className="w-3.5 h-3.5 text-slate-400" />
            Historical & Crisis Scenarios
          </label>
          <span className="text-[11px] text-slate-400">One-click standard stress templates</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5">
          {STRESS_TEST_PRESETS.map(preset => {
            const isSelected = config.enabled && config.selectedPresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                id={`preset-${preset.id}`}
                disabled={disabled}
                onClick={() => handleSelectPreset(preset.id)}
                title={preset.description}
                className={`px-2.5 py-1.5 rounded-lg text-left text-xs transition-all border cursor-pointer disabled:opacity-50 ${
                  isSelected
                    ? 'bg-amber-500 text-white border-amber-600 font-semibold shadow-sm'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                <div className="truncate text-[11px] font-medium">{preset.name}</div>
                <div className={`text-[10px] mt-0.5 truncate ${isSelected ? 'text-amber-100' : 'text-slate-400'}`}>
                  {preset.volatilityMultiplier}x Vol • {preset.correlationShock > 0 ? `+${preset.correlationShock}` : preset.correlationShock} Corr
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sliders Grid */}
      <div className="mt-4 pt-3 border-t border-slate-200/80 grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* 1. Volatility Multiplier */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-slate-700 flex items-center gap-1">
              <Activity className="w-3.5 h-3.5 text-red-500" />
              Volatility Multiplier (σ)
            </span>
            <span className="font-mono px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-800 text-xs font-semibold">
              {config.volatilityMultiplier.toFixed(2)}x
            </span>
          </div>
          <input
            type="range"
            min="0.5"
            max="3.5"
            step="0.05"
            disabled={disabled}
            value={config.volatilityMultiplier}
            onChange={e => handleParameterChange('volatilityMultiplier', parseFloat(e.target.value))}
            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-red-600 disabled:opacity-50"
          />
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>0.5x (Subdued)</span>
            <span>1.0x (Normal)</span>
            <span>2.0x (High)</span>
            <span>3.5x (Extreme)</span>
          </div>
        </div>

        {/* 2. Systemic Correlation Shock */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-slate-700 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-blue-600" />
              Correlation Contagion (Δρ)
            </span>
            <span className="font-mono px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-800 text-xs font-semibold">
              {config.correlationShock > 0 ? `+${config.correlationShock.toFixed(2)}` : config.correlationShock.toFixed(2)}
            </span>
          </div>
          <input
            type="range"
            min="-0.40"
            max="0.60"
            step="0.05"
            disabled={disabled}
            value={config.correlationShock}
            onChange={e => handleParameterChange('correlationShock', parseFloat(e.target.value))}
            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600 disabled:opacity-50"
          />
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>-0.40 (Decoupled)</span>
            <span>0.00 (Base)</span>
            <span>+0.30 (Contagion)</span>
            <span>+0.60 (Panic)</span>
          </div>
        </div>

        {/* 3. Market Return Shock / Drift */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-slate-700 flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5 text-amber-600" />
              Annual Return Drift Shock (Δμ)
            </span>
            <span className="font-mono px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-800 text-xs font-semibold">
              {(config.marketDriftShock * 100).toFixed(1)}%
            </span>
          </div>
          <input
            type="range"
            min="-0.40"
            max="0.20"
            step="0.02"
            disabled={disabled}
            value={config.marketDriftShock}
            onChange={e => handleParameterChange('marketDriftShock', parseFloat(e.target.value))}
            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-600 disabled:opacity-50"
          />
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>-40% (Crash)</span>
            <span>-20% (Bear)</span>
            <span>0% (Neutral)</span>
            <span>+20% (Rally)</span>
          </div>
        </div>
      </div>

      {/* Universe targeting row & Info banner */}
      <div className="mt-3 pt-3 border-t border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-slate-600 font-medium">Shock Target Universe:</span>
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
            {(['All', 'Core', 'Periphery'] as const).map(target => (
              <button
                key={target}
                type="button"
                id={`target-${target.toLowerCase()}`}
                disabled={disabled}
                onClick={() => handleParameterChange('targetUniverse', target)}
                className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors cursor-pointer ${
                  config.targetUniverse === target
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {target === 'All' ? 'All Assets (Uniform)' : target === 'Core' ? 'Core Assets (Central)' : 'Periphery Assets'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
          <Info className="w-3.5 h-3.5 shrink-0 text-slate-400" />
          <span>
            {config.enabled
              ? 'TMFG graph, universe asset splits, and portfolio weights update dynamically with stressed covariance.'
              : 'Stress parameters are currently dormant. Click "Enable Stress Test" or pick a scenario above.'}
          </span>
        </div>
      </div>
    </div>
  );
};
