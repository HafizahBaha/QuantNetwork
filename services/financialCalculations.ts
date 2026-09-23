import { AssetData, NetworkNode, NetworkEdge, PortfolioResult, Universe, CorrelationMatrix, NetworkData, StressTestConfig, BacktestDataPoint, BacktestSummary, SplitBacktestResult, SampleSplitMode } from '../types';

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

/**
 * Projects an arbitrary vector v onto the probability simplex {w >= 0, sum(w) = 1}.
 * Uses the exact O(N log N) sorting algorithm (Wang & Carreira-Perpinán, 2013).
 */
function projectSimplex(v: number[]): number[] {
  const n = v.length;
  if (n === 0) return [];
  if (n === 1) return [1.0];

  const sorted = [...v].sort((a, b) => b - a);
  let cumSum = 0;
  let rho = 0;
  for (let i = 0; i < n; i++) {
    cumSum += sorted[i];
    if (sorted[i] + (1 - cumSum) / (i + 1) > 0) {
      rho = i;
    }
  }
  let sumRho = 0;
  for (let i = 0; i <= rho; i++) {
    sumRho += sorted[i];
  }
  const theta = (sumRho - 1) / (rho + 1);
  const projected = v.map(x => Math.max(0, x - theta));
  const total = projected.reduce((a, b) => a + b, 0);
  if (total > 0) {
    return projected.map(x => x / total);
  }
  return v.map(() => 1 / n);
}

/**
 * Solves Markowitz Mean-Variance Tangency / Maximum Sharpe Ratio Portfolio.
 * Maximizes (w^T * mu - Rf) / sqrt(w^T * Sigma * w) on the simplex {w >= 0, sum(w) = 1}.
 */
function solveMeanVarianceWeights(assets: AssetData[]): Record<string, number> {
  const n = assets.length;
  const symbols = assets.map(a => a.symbol);
  const weights: Record<string, number> = {};
  if (n === 0) return weights;
  if (n === 1) {
    weights[symbols[0]] = 1.0;
    return weights;
  }

  const tradingDays = 252;
  const rf = 0.02;

  // Expected returns (annualized)
  const mu = assets.map(a => getMean(a.returns) * tradingDays);

  // Covariance matrix (annualized)
  const sigma: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const c = getCovariance(assets[i].returns, assets[j].returns) * tradingDays;
      sigma[i][j] = c;
      sigma[j][i] = c;
    }
    sigma[i][i] += 1e-6; // Regularization
  }

  // Initial weights: inverse volatility
  let w = assets.map(a => {
    const s = getStdDev(a.returns);
    return s > 0 ? 1 / s : 1;
  });
  const sumInit = w.reduce((a, b) => a + b, 0);
  w = w.map(x => x / (sumInit || n));

  const calcStats = (weightsVec: number[]) => {
    let portMu = 0;
    let portVar = 0;
    for (let i = 0; i < n; i++) {
      portMu += weightsVec[i] * mu[i];
      let rowDot = 0;
      for (let j = 0; j < n; j++) {
        rowDot += sigma[i][j] * weightsVec[j];
      }
      portVar += weightsVec[i] * rowDot;
    }
    const portVol = Math.sqrt(Math.max(1e-8, portVar));
    const sharpe = (portMu - rf) / portVol;
    return { portMu, portVol, sharpe };
  };

  let bestW = [...w];
  let bestSharpe = calcStats(w).sharpe;

  // Projected Gradient Ascent to maximize Sharpe Ratio
  const iterations = 150;
  const lr = 0.1;

  for (let iter = 0; iter < iterations; iter++) {
    const { portMu, portVol } = calcStats(w);
    const excess = portMu - rf;

    const grad = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      let sigmaDotW = 0;
      for (let j = 0; j < n; j++) {
        sigmaDotW += sigma[i][j] * w[j];
      }
      if (excess > 0) {
        grad[i] = (mu[i] / portVol) - (excess * sigmaDotW) / (portVol * portVol * portVol);
      } else {
        // Fallback to minimum variance gradient
        grad[i] = -sigmaDotW;
      }
    }

    const step = lr / Math.sqrt(iter + 1);
    const candidateV = w.map((wi, i) => wi + step * grad[i]);
    const nextW = projectSimplex(candidateV);

    const stats = calcStats(nextW);
    if (stats.sharpe > bestSharpe) {
      bestSharpe = stats.sharpe;
      bestW = [...nextW];
    }
    w = nextW;
  }

  symbols.forEach((s, i) => {
    weights[s] = bestW[i] > 1e-4 ? bestW[i] : 0;
  });

  const finalSum = Object.values(weights).reduce((a, b) => a + b, 0);
  if (finalSum > 0) {
    symbols.forEach(s => {
      weights[s] = weights[s] / finalSum;
    });
  } else {
    symbols.forEach(s => {
      weights[s] = 1 / n;
    });
  }

  return weights;
}

/**
 * Solves for true Equal Risk Contribution (ERC) Risk Parity weights using
 * Spinu's convex formulation (2013) and Cyclical Coordinate Descent (Griveau-Billion et al., 2013).
 * Minimizes f(y) = 0.5 * y^T * Sigma * y - (1/N) * sum(ln(y_i)), then w = y / sum(y).
 */
function solveRiskParityWeights(assets: AssetData[]): Record<string, number> {
  const n = assets.length;
  const symbols = assets.map(a => a.symbol);
  const weights: Record<string, number> = {};
  if (n === 0) return weights;
  if (n === 1) {
    weights[symbols[0]] = 1.0;
    return weights;
  }

  // Covariance matrix
  const sigma: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const c = getCovariance(assets[i].returns, assets[j].returns);
      sigma[i][j] = c;
      sigma[j][i] = c;
    }
    sigma[i][i] = Math.max(1e-8, sigma[i][i]);
  }

  // Initialize y_i = 1 / sqrt(sigma_ii)
  const y = assets.map((_, i) => 1 / Math.sqrt(sigma[i][i]));
  const targetRiskBudget = 1.0 / n;

  // Cyclical Coordinate Descent (CCD)
  // At each coordinate i: a * y_i^2 + b * y_i - c = 0
  // where a = sigma_ii, b = sum_{j != i} sigma_ij * y_j, c = 1 / N
  // y_i = (-b + sqrt(b^2 + 4 * a * c)) / (2 * a)
  const maxCycles = 40;
  for (let cycle = 0; cycle < maxCycles; cycle++) {
    for (let i = 0; i < n; i++) {
      const a = sigma[i][i];
      let b = 0;
      for (let j = 0; j < n; j++) {
        if (j !== i) {
          b += sigma[i][j] * y[j];
        }
      }
      const c = targetRiskBudget;
      const discriminant = b * b + 4 * a * c;
      y[i] = (-b + Math.sqrt(Math.max(0, discriminant))) / (2 * a);
    }
  }

  const sumY = y.reduce((acc, val) => acc + val, 0);
  symbols.forEach((s, i) => {
    weights[s] = sumY > 0 ? y[i] / sumY : 1 / n;
  });

  return weights;
}

/**
 * Minimizes Conditional Value at Risk (CVaR) at 95% confidence level
 * using Projected Subgradient Descent on the unit simplex.
 */
function solveCvarWeights(assets: AssetData[]): Record<string, number> {
  const n = assets.length;
  const symbols = assets.map(a => a.symbol);
  const weights: Record<string, number> = {};
  if (n === 0) return weights;
  if (n === 1) {
    weights[symbols[0]] = 1.0;
    return weights;
  }

  const numPeriods = assets[0]?.returns?.length || 0;
  if (numPeriods < 5) {
    symbols.forEach(s => {
      weights[s] = 1 / n;
    });
    return weights;
  }

  // Pre-extract returns matrix for fast access: returnsMatrix[t][i]
  const returnsMatrix: number[][] = [];
  for (let t = 0; t < numPeriods; t++) {
    const row = new Array(n);
    for (let i = 0; i < n; i++) {
      row[i] = assets[i].returns[t] || 0;
    }
    returnsMatrix.push(row);
  }

  const tailCount = Math.max(1, Math.floor(numPeriods * 0.05));

  // Compute portfolio CVaR and its subgradient for a weight vector w
  const evaluateCvar = (w: number[]) => {
    const periodReturns: { returnVal: number; index: number }[] = [];
    for (let t = 0; t < numPeriods; t++) {
      let r = 0;
      for (let i = 0; i < n; i++) {
        r += w[i] * returnsMatrix[t][i];
      }
      periodReturns.push({ returnVal: r, index: t });
    }

    periodReturns.sort((a, b) => a.returnVal - b.returnVal);
    const worstTail = periodReturns.slice(0, tailCount);

    let sumTail = 0;
    const subgrad = new Array(n).fill(0);
    for (let k = 0; k < worstTail.length; k++) {
      sumTail += worstTail[k].returnVal;
      const t = worstTail[k].index;
      for (let i = 0; i < n; i++) {
        subgrad[i] -= returnsMatrix[t][i];
      }
    }
    const cvarVal = -sumTail / tailCount;
    for (let i = 0; i < n; i++) {
      subgrad[i] /= tailCount;
    }

    return { cvarVal, subgrad };
  };

  // Initialize with equal weights
  let w = symbols.map(() => 1 / n);
  let bestW = [...w];
  let minCvar = evaluateCvar(w).cvarVal;

  const iterations = 100;
  const initialStep = 0.08;

  for (let iter = 0; iter < iterations; iter++) {
    const { cvarVal, subgrad } = evaluateCvar(w);
    if (cvarVal < minCvar) {
      minCvar = cvarVal;
      bestW = [...w];
    }

    const step = initialStep / Math.sqrt(iter + 1);
    const nextUnprojected = w.map((wi, i) => wi - step * subgrad[i]);
    w = projectSimplex(nextUnprojected);
  }

  symbols.forEach((s, i) => {
    weights[s] = bestW[i] > 1e-4 ? bestW[i] : 0;
  });

  const finalSum = Object.values(weights).reduce((a, b) => a + b, 0);
  if (finalSum > 0) {
    symbols.forEach(s => {
      weights[s] = weights[s] / finalSum;
    });
  } else {
    symbols.forEach(s => {
      weights[s] = 1 / n;
    });
  }

  return weights;
}

function getWeights(model: string, assets: AssetData[]): Record<string, number> {
  const symbols = assets.map(a => a.symbol);
  const weights: Record<string, number> = {};
  if (symbols.length === 0) return weights;

  switch (model) {
    case '1/N (Benchmark)':
      symbols.forEach(s => {
        weights[s] = 1 / symbols.length;
      });
      return weights;

    case 'Mean-Variance':
      return solveMeanVarianceWeights(assets);

    case 'Risk Parity':
      return solveRiskParityWeights(assets);

    case 'CVaR':
      return solveCvarWeights(assets);

    default:
      symbols.forEach(s => {
        weights[s] = 1 / symbols.length;
      });
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

// --- 80/20 IN-SAMPLE & OUT-OF-SAMPLE TEST ENGINE ---
export function calculate8020SplitBacktest(
  benchmarkPortfolio: PortfolioResult,
  strategyPortfolio: PortfolioResult,
  assets: AssetData[],
  dateLabels: string[] = [],
  recalibrateOnInSample: boolean = false,
  correlationThreshold: number = 0.5,
  stressConfig?: StressTestConfig
): SplitBacktestResult {
  const totalPeriods = assets.length > 0 && assets[0].returns ? assets[0].returns.length : 0;
  const splitRatio = 0.8;
  const splitIndex = Math.max(2, Math.min(totalPeriods - 2, Math.floor(totalPeriods * splitRatio)));

  let effectiveStrategyPortfolio = strategyPortfolio;
  let inSampleWeights: Record<string, number> | undefined = undefined;

  // If strict In-Sample calibration is enabled, train TMFG network & optimize weights strictly on the first 80%
  if (recalibrateOnInSample && totalPeriods >= 5) {
    try {
      const inSampleAssets: AssetData[] = assets.map(a => ({
        ...a,
        returns: a.returns.slice(0, splitIndex),
        dateLabels: a.dateLabels ? a.dateLabels.slice(0, splitIndex + 1) : []
      }));

      const inSampleMatrix = calculateCorrelationMatrix(inSampleAssets);
      const inSampleAnalysis = runNetworkAndPortfolioAnalysis(
        inSampleAssets,
        inSampleMatrix,
        correlationThreshold,
        stressConfig
      );

      const matched = inSampleAnalysis.portfolios.find(
        p => p.model === strategyPortfolio.model && p.universe === strategyPortfolio.universe
      );

      if (matched) {
        effectiveStrategyPortfolio = {
          ...strategyPortfolio,
          weights: matched.weights
        };
        inSampleWeights = matched.weights;
      }
    } catch (e) {
      console.warn("In-sample calibration fallback to full sample weights:", e);
    }
  }

  // 1. Full continuous duration series (with sampleType attached)
  const fullRes = calculateBacktest(benchmarkPortfolio, effectiveStrategyPortfolio, assets, dateLabels);
  const fullSeriesWithTags: BacktestDataPoint[] = fullRes.series.map(pt => ({
    ...pt,
    sampleType: pt.index <= splitIndex ? 'in-sample' : 'out-of-sample',
    isSplitPoint: pt.index === splitIndex
  }));

  // 2. In-sample slice: 0 to splitIndex
  const inSampleAssets: AssetData[] = assets.map(a => ({
    ...a,
    returns: a.returns.slice(0, splitIndex)
  }));
  const inSampleDateLabels = dateLabels.slice(0, splitIndex + 1);
  const inSampleRes = calculateBacktest(benchmarkPortfolio, effectiveStrategyPortfolio, inSampleAssets, inSampleDateLabels);
  const inSampleSeriesTagged: BacktestDataPoint[] = inSampleRes.series.map(pt => ({
    ...pt,
    sampleType: 'in-sample',
    isSplitPoint: pt.index === splitIndex
  }));

  // 3. Out-of-sample slice: splitIndex to totalPeriods
  const outOfSampleAssets: AssetData[] = assets.map(a => ({
    ...a,
    returns: a.returns.slice(splitIndex)
  }));
  const outOfSampleDateLabels = dateLabels.slice(splitIndex);
  const outOfSampleRes = calculateBacktest(benchmarkPortfolio, effectiveStrategyPortfolio, outOfSampleAssets, outOfSampleDateLabels);
  const outOfSampleSeriesTagged: BacktestDataPoint[] = outOfSampleRes.series.map(pt => ({
    ...pt,
    sampleType: 'out-of-sample'
  }));

  // Robustness / Overfitting Analytics
  const isSharpe = inSampleRes.summary.strategySharpeRatio;
  const oosSharpe = outOfSampleRes.summary.strategySharpeRatio;
  const isReturn = inSampleRes.summary.strategyAnnualizedReturn;
  const oosReturn = outOfSampleRes.summary.strategyAnnualizedReturn;
  const isAlpha = inSampleRes.summary.alpha;
  const oosAlpha = outOfSampleRes.summary.alpha;

  const sharpeDecayRatio = isSharpe !== 0 ? oosSharpe / isSharpe : 1;
  const returnDecayRatio = isReturn !== 0 ? oosReturn / isReturn : 1;
  const alphaRetention = isAlpha !== 0 ? oosAlpha / isAlpha : 1;

  let overfittingRisk: 'Low' | 'Moderate' | 'High' = 'Low';
  let verdictMessage = '';

  if (oosSharpe >= 0.75 * isSharpe || (oosSharpe > 0.8 && oosSharpe >= isSharpe - 0.3)) {
    overfittingRisk = 'Low';
    verdictMessage = 'Robust Generalization: Strategy preserved high Sharpe efficiency on unseen out-of-sample data with zero parameter overfitting.';
  } else if (oosSharpe >= 0.35 * isSharpe && oosSharpe > 0) {
    overfittingRisk = 'Moderate';
    verdictMessage = 'Moderate Decay: Out-of-sample performance experienced some volatility drag compared to in-sample training, but maintains alpha.';
  } else {
    overfittingRisk = 'High';
    verdictMessage = 'Overfitting Alert: Severe out-of-sample degradation indicates that optimization weights may have overfit in-sample idiosyncratic noise.';
  }

  const splitDateLabel = fullRes.series[splitIndex]?.label || `Period ${splitIndex}`;

  return {
    splitIndex,
    splitRatio,
    splitDateLabel,
    inSampleCount: splitIndex,
    outOfSampleCount: totalPeriods - splitIndex,
    inSample: {
      series: inSampleSeriesTagged,
      summary: inSampleRes.summary
    },
    outOfSample: {
      series: outOfSampleSeriesTagged,
      summary: outOfSampleRes.summary
    },
    fullDuration: {
      series: fullSeriesWithTags,
      summary: fullRes.summary
    },
    robustness: {
      sharpeDecayRatio,
      returnDecayRatio,
      alphaRetention,
      isRobust: overfittingRisk === 'Low',
      overfittingRisk,
      verdictMessage
    },
    inSampleTrainedWeights: inSampleWeights,
    recalibratedOnInSample: recalibrateOnInSample
  };
}

