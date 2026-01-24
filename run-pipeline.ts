/**
 * Run full pipeline and display results
 */

import { runAgentPipeline, clearPipelineCache } from './src/lib/agent-pipeline';

async function main() {
  console.log('='.repeat(80));
  console.log('RUNNING FULL TRADING AGENT PIPELINE');
  console.log('='.repeat(80));
  console.log('');

  // Clear cache to force fresh data
  console.log('Clearing cache to force fresh scan...\n');
  clearPipelineCache();

  const startTime = Date.now();

  try {
    const state = await runAgentPipeline({
      equity: 100000,
      cash: 50000,
      forceRefresh: true,
      onProgress: (p) => {
        const bar = '█'.repeat(Math.floor(p.progress / 5)) + '░'.repeat(20 - Math.floor(p.progress / 5));
        console.log(`[${bar}] ${p.progress}% - ${p.task}: ${p.message}`);
      },
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n');
    console.log('='.repeat(80));
    console.log(`PIPELINE COMPLETE (${elapsed}s)`);
    console.log('='.repeat(80));

    // Task 1: Market State
    console.log('\n📊 TASK 1: MARKET STATE');
    console.log('─'.repeat(40));
    console.log(`State: ${state.marketState.state}`);
    console.log(`QQQE Position: ${state.marketState.qqqe_structure_position}`);
    console.log(`MCO Z-Score: ${state.marketState.mco_z?.toFixed(2)}`);
    console.log(`Breadth Direction: ${state.marketState.breadth_direction}`);
    console.log(`New Entries: ${state.marketState.permissions?.new_entries}`);

    // Task 2: Universe
    console.log('\n📊 TASK 2: LIQUID LEADERS UNIVERSE');
    console.log('─'.repeat(40));
    console.log(`Count: ${state.universe.count} liquid leaders`);
    console.log('Top 10:');
    (state.universe.leaders ?? []).slice(0, 10).forEach((l, i) => {
      console.log(`  ${i + 1}. ${l.ticker.padEnd(6)} RS:${String(l.rs).padStart(2)} Price:$${l.price?.toFixed(2) ?? 'N/A'} ADR:${l.adr_pct?.toFixed(1) ?? 'N/A'}%`);
    });

    // Task 3: Pullbacks
    console.log('\n📊 TASK 3: PULLBACK CANDIDATES');
    console.log('─'.repeat(40));
    console.log(`Count: ${state.pullbacks.count} pullback candidates`);
    if (state.pullbacks.candidates.length > 0) {
      console.log('Candidates:');
      state.pullbacks.candidates.slice(0, 10).forEach((c, i) => {
        console.log(`  ${i + 1}. ${c.ticker.padEnd(6)} Grade:${c.grade} Mode:${c.mode} Dist21:${c.dist_21_atr?.toFixed(2)} Contract:${c.contraction ? 'Y' : 'N'}`);
      });
    } else {
      console.log('  No pullback candidates found');
    }

    // Task 4: Readiness
    console.log('\n📊 TASK 4: ENTRY READINESS');
    console.log('─'.repeat(40));
    const readyRows = state.readiness.rows.filter(r => r.ready);
    console.log(`Ready: ${readyRows.length} / ${state.readiness.rows.length}`);
    if (readyRows.length > 0) {
      console.log('Ready tickers:');
      readyRows.slice(0, 10).forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.ticker.padEnd(6)} Mode:${r.mode} Earnings:${r.earnings_days ?? 'N/A'}d`);
      });
    }

    // Task 5: Focus List
    console.log('\n📊 TASK 5: FOCUS LIST');
    console.log('─'.repeat(40));
    console.log(`Top 5: ${state.focusList.top5.join(', ') || 'None'}`);
    if (state.focusList.candidates && state.focusList.candidates.length > 0) {
      console.log('\nAll candidates:');
      state.focusList.candidates.slice(0, 10).forEach((c, i) => {
        console.log(`  ${i + 1}. ${c.ticker.padEnd(6)} Score:${c.score ?? 'N/A'} Grade:${c.reclaim_backtest_grade} Mode:${c.mode}`);
      });
    }

    // Task 6: Sizing
    console.log('\n📊 TASK 6: POSITION SIZING');
    console.log('─'.repeat(40));
    const passed = state.sizing.sizing.filter(s => s.gate === 'PASS');
    const withheld = state.sizing.sizing.filter(s => s.gate !== 'PASS');
    console.log(`Passed: ${passed.length}, Withheld: ${withheld.length}`);
    if (passed.length > 0) {
      console.log('\nPassed trades:');
      passed.forEach((s, i) => {
        console.log(`  ${i + 1}. ${s.ticker.padEnd(6)} $${s.position_dollars?.toFixed(0) ?? 'N/A'} (${s.shares ?? 'N/A'} shares) NER:${(s.ec_risk_percent ?? 0).toFixed(2)}%`);
      });
    }
    if (withheld.length > 0) {
      console.log('\nWithheld:');
      withheld.slice(0, 5).forEach((s, i) => {
        console.log(`  ${i + 1}. ${s.ticker.padEnd(6)} - ${s.withhold_reason}`);
      });
    }

    // Task 7: Execution Plan
    console.log('\n📊 TASK 7: EXECUTION PLAN');
    console.log('─'.repeat(40));
    console.log(`Orders ready: ${state.executionPlan.passed.length}`);
    if (state.executionPlan.passed.length > 0) {
      console.log('\nOrder tickets:');
      state.executionPlan.passed.forEach((o, i) => {
        console.log(`  ${i + 1}. ${o.action_type ?? 'BUY'} ${o.ticker}: ${o.entry.shares} shares @ $${o.entry_price?.toFixed(2)} | SSL:$${o.stop.ssl?.toFixed(2)} | 2R:$${o.profit.trim_2r.price?.toFixed(2)}`);
      });
    }

    // Task 8: Portfolio
    console.log('\n📊 TASK 8: PORTFOLIO');
    console.log('─'.repeat(40));
    console.log(`Open positions: ${state.portfolio.summary.position_count ?? state.portfolio.positions.length}`);
    console.log(`Equity: $${state.portfolio.summary.equity?.toLocaleString() ?? 'N/A'}`);
    console.log(`Cash: $${state.portfolio.summary.cash?.toLocaleString() ?? 'N/A'}`);
    console.log(`Total NER: ${state.portfolio.summary.ner?.toFixed(2) ?? 0}%`);

    // Task 9: Overview
    console.log('\n📊 TASK 9: OVERVIEW');
    console.log('─'.repeat(40));
    console.log(`Trades today: ${state.overview.trades_today.length}`);
    if (state.overview.trades_today.length > 0) {
      state.overview.trades_today.slice(0, 5).forEach((t, i) => {
        console.log(`  ${i + 1}. ${t.action} ${t.shares} ${t.ticker} @ $${t.price.toFixed(2)}`);
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log('PIPELINE COMPLETE');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('Pipeline failed:', error);
  }
}

main();
