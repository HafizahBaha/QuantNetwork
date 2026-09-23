import { GoogleGenAI } from "@google/genai";
import { PortfolioResult } from '../types';

export async function getExecutiveSummary(
  portfolios: PortfolioResult[],
  totalAssets: number,
  coreAssets: number,
  peripheralAssets: number
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const benchmark = portfolios.find(p => p.model === '1/N (Benchmark)');
  const bestPortfolio = portfolios.slice(1).reduce((prev, current) => 
    (prev.sharpeRatio > current.sharpeRatio) ? prev : current, { sharpeRatio: -Infinity } as PortfolioResult
  );

  const prompt = `
You are a quantitative research analyst AI. Your task is to generate a concise executive summary based on a comparative portfolio performance report.

The report compares standard portfolio models across three universes:
1. "Full": All available assets.
2. "Core": The 30% most central assets from a network analysis.
3. "Periphery": The 30% most peripheral assets from a network analysis.
The primary benchmark is an equally-weighted portfolio (1/N) of all assets.

**Analysis Results:**
- Total assets in the full universe: ${totalAssets}
- Assets in Core universe: ${coreAssets}
- Assets in Periphery universe: ${peripheralAssets}
- Benchmark (1/N) Sharpe Ratio: ${benchmark?.sharpeRatio.toFixed(3)}
- Best Overall Model: "${bestPortfolio.model} (${bestPortfolio.universe})" with Sharpe Ratio: ${bestPortfolio.sharpeRatio.toFixed(3)}
- Best Core Sharpe: ${Math.max(...portfolios.filter(p => p.universe === "Core").map(p => p.sharpeRatio), -Infinity).toFixed(3)}
- Best Periphery Sharpe: ${Math.max(...portfolios.filter(p => p.universe === "Periphery").map(p => p.sharpeRatio), -Infinity).toFixed(3)}
- Best Full Sharpe: ${Math.max(...portfolios.filter(p => p.universe === "Full" && p.model !== '1/N (Benchmark)').map(p => p.sharpeRatio), -Infinity).toFixed(3)}

**Your Task:**
Write a 2-3 sentence executive summary.
1. State the number of total, core, and peripheral assets identified.
2. Highlight which model and universe (Full, Core, or Periphery) provided the best risk-adjusted return (Sharpe Ratio).
3. Briefly comment on whether the core or periphery filtering strategy was more effective than using the full universe, referencing the best Sharpe ratios for each.

Example: "The analysis of ${totalAssets} assets identified ${coreAssets} core and ${peripheralAssets} peripheral securities. The [Model Name] portfolio using the [Core/Periphery/Full] universe delivered the best risk-adjusted return (Sharpe: [X.XX]). The [periphery/core] filtering strategy proved most effective, outperforming both the full universe and the 1/N benchmark."
Do not add any preamble or markdown formatting. Just return the text.
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return "AI insights could not be generated at this time.";
  }
}