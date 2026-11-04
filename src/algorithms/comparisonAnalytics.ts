import {
  ActionPlanItem,
  AssessmentScheme,
  ClassStatistics,
  CompletenessReport,
  ComponentStatusItem,
  CompetitorComparisonItem,
  CourseHistorySnapshot,
  HeadToHeadReport,
  PotentialTotals,
  PredictionResult,
  RivalRuleConfig,
  StudentRecord,
  StudentTrend,
  TargetCalculation,
  WhatChangedReport,
} from '../types';
import { calculateComponentEarned, calculateStudentTarget } from './targetCalculator';
import { calculateStudentRanks, StudentRankItem } from './ranking';

/**
 * Computes comprehensive statistical distribution across all enrolled students:
 * mean, median, standard deviation, top score, and distribution bins.
 */
export function calculateClassStatistics(
  students: StudentRecord[],
  scheme: AssessmentScheme,
  meStudent: StudentRecord | null
): ClassStatistics {
  const count = students.length;
  if (count === 0) {
    return {
      count: 0,
      sessionalAverage: 0,
      sessionalMedian: 0,
      sessionalTop: 0,
      sessionalMin: 0,
      sessionalStdDev: 0,
      finalAverage: null,
      finalCount: 0,
      componentStats: {},
      strongestComponent: null,
      weakestComponent: null,
      distributionHistogram: [],
    };
  }

  const studentCalcs = students.map((s) => ({
    student: s,
    calc: calculateStudentTarget(s, scheme),
  }));

  const sessionalScores = studentCalcs.map((sc) => sc.calc.sessionalTotalEarned);
  sessionalScores.sort((a, b) => a - b);

  const sumSessional = sessionalScores.reduce((acc, v) => acc + v, 0);
  const sessionalAverage = Number((sumSessional / count).toFixed(2));
  const sessionalMedian =
    count % 2 === 1
      ? sessionalScores[Math.floor(count / 2)]
      : Number(
          ((sessionalScores[count / 2 - 1] + sessionalScores[count / 2]) / 2).toFixed(2)
        );
  const sessionalTop = sessionalScores[count - 1];
  const sessionalMin = sessionalScores[0];

  const variance =
    sessionalScores.reduce((acc, v) => acc + Math.pow(v - sessionalAverage, 2), 0) /
    (count > 1 ? count - 1 : 1);
  const sessionalStdDev = Number(Math.sqrt(variance).toFixed(2));

  const finalsTaken = students
    .map((s) => s.finalMark)
    .filter((f): f is number => f !== null && f !== undefined && !isNaN(f));
  const finalCount = finalsTaken.length;
  const finalAverage =
    finalCount > 0
      ? Number((finalsTaken.reduce((a, b) => a + b, 0) / finalCount).toFixed(2))
      : null;

  const nonFinals = scheme.components.filter((c) => !c.isFinalExam);
  const componentStats: ClassStatistics['componentStats'] = {};

  const myCalc = meStudent ? calculateStudentTarget(meStudent, scheme) : null;
  const componentZScores: { name: string; zScore: number; diff: number }[] = [];

  for (const comp of nonFinals) {
    const scores = studentCalcs.map((sc) => {
      const match = sc.calc.componentsBreakdown.find((cb) => cb.componentId === comp.id);
      return match ? match.earnedScaledMarks : 0;
    });
    scores.sort((a, b) => a - b);

    const compSum = scores.reduce((a, b) => a + b, 0);
    const avg = Number((compSum / count).toFixed(2));
    const med =
      count % 2 === 1
        ? scores[Math.floor(count / 2)]
        : Number(((scores[count / 2 - 1] + scores[count / 2]) / 2).toFixed(2));
    const top = scores[scores.length - 1];
    const min = scores[0];

    const compVar =
      scores.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / (count > 1 ? count - 1 : 1);
    const std = Number(Math.sqrt(compVar).toFixed(2));

    const myCompBreakdown = myCalc?.componentsBreakdown.find((cb) => cb.componentId === comp.id);
    const myScore = myCompBreakdown ? myCompBreakdown.earnedScaledMarks : 0;
    const zScore = std > 0.05 ? Number(((myScore - avg) / std).toFixed(2)) : 0;

    componentStats[comp.id] = {
      name: comp.name,
      weight: comp.weight,
      average: avg,
      median: med,
      top,
      min,
      stdDev: std,
      myScore,
      zScore,
    };

    if (std > 0.05) {
      componentZScores.push({
        name: comp.name,
        zScore,
        diff: Number((myScore - avg).toFixed(2)),
      });
    }
  }

  componentZScores.sort((a, b) => b.zScore - a.zScore);
  const strongestComponent = componentZScores.length > 0 ? componentZScores[0] : null;
  const weakestComponent =
    componentZScores.length > 1 ? componentZScores[componentZScores.length - 1] : null;

  const maxSessionalWeight = nonFinals.reduce((a, b) => a + b.weight, 0);
  const binStep = Math.max(2, Math.ceil(maxSessionalWeight / 8));
  const bins: ClassStatistics['distributionHistogram'] = [];

  for (let b = 0; b < maxSessionalWeight; b += binStep) {
    const binStart = b;
    const binEnd = Math.min(b + binStep, maxSessionalWeight);
    const inBin = sessionalScores.filter((score) =>
      binEnd === maxSessionalWeight
        ? score >= binStart && score <= binEnd
        : score >= binStart && score < binEnd
    );
    const myScore = myCalc?.sessionalTotalEarned ?? -1;
    const hasMe =
      binEnd === maxSessionalWeight
        ? myScore >= binStart && myScore <= binEnd
        : myScore >= binStart && myScore < binEnd;

    bins.push({
      binStart,
      binEnd,
      label: `${binStart}-${binEnd}`,
      count: inBin.length,
      hasMe,
    });
  }

  return {
    count,
    sessionalAverage,
    sessionalMedian,
    sessionalTop,
    sessionalMin,
    sessionalStdDev,
    finalAverage,
    finalCount,
    componentStats,
    strongestComponent,
    weakestComponent,
    distributionHistogram: bins,
  };
}

/**
 * Part B1/B3: Detects completeness across all components.
 * Labels each component: "Published for everyone", "Published for some", or "Not published".
 */
export function detectCompleteness(
  students: StudentRecord[],
  scheme: AssessmentScheme
): CompletenessReport {
  const totalStudents = students.length;
  const items: ComponentStatusItem[] = [];

  let fairMarksAvailable = 0;
  const publishedForAllNames: string[] = [];

  const nonFinals = scheme.components.filter((c) => !c.isFinalExam);

  for (const comp of nonFinals) {
    if (comp.type === 'single') {
      const publishedCount = students.filter((s) => {
        const v = s.marks[comp.id];
        return v !== null && v !== undefined && !isNaN(v);
      }).length;

      const pct = totalStudents > 0 ? (publishedCount / totalStudents) * 100 : 0;
      let status: ComponentStatusItem['status'] = 'not_published';
      if (publishedCount === totalStudents && totalStudents > 0) {
        status = 'published_all';
        fairMarksAvailable += comp.weight;
        publishedForAllNames.push(comp.name);
      } else if (publishedCount > 0) {
        status = 'published_some';
      }

      items.push({
        id: comp.id,
        name: comp.name,
        weight: comp.weight,
        status,
        publishedCount,
        totalStudents,
        publishedPct: Number(pct.toFixed(1)),
      });
    } else if (comp.type === 'best_n_of_m' && comp.subComponents) {
      // Sub-tests (e.g. CT1, CT2, CT3, CT4)
      for (const sub of comp.subComponents) {
        const publishedCount = students.filter((s) => {
          const v = s.marks[sub.id];
          return v !== null && v !== undefined && !isNaN(v);
        }).length;

        const pct = totalStudents > 0 ? (publishedCount / totalStudents) * 100 : 0;
        let status: ComponentStatusItem['status'] = 'not_published';
        if (publishedCount === totalStudents && totalStudents > 0) {
          status = 'published_all';
          publishedForAllNames.push(sub.name);
        } else if (publishedCount > 0) {
          status = 'published_some';
        }

        items.push({
          id: sub.id,
          name: sub.name,
          weight: Math.round(comp.weight / (comp.bestN || comp.subComponents.length)),
          status,
          publishedCount,
          totalStudents,
          publishedPct: Number(pct.toFixed(1)),
          isSubComponent: true,
          parentId: comp.id,
        });
      }

      // Check parent best-N status
      const allSubsAll = comp.subComponents.every((sub) =>
        items.find((i) => i.id === sub.id)?.status === 'published_all'
      );
      if (allSubsAll) {
        fairMarksAvailable += comp.weight;
      }
    }
  }

  // Also check semester final component
  const finalComp = scheme.components.find((c) => c.isFinalExam);
  if (finalComp) {
    const publishedCount = students.filter((s) => {
      const v = s.finalMark;
      return v !== null && v !== undefined && !isNaN(v);
    }).length;
    const pct = totalStudents > 0 ? (publishedCount / totalStudents) * 100 : 0;
    let status: ComponentStatusItem['status'] = 'not_published';
    if (publishedCount === totalStudents && totalStudents > 0) {
      status = 'published_all';
      fairMarksAvailable += finalComp.weight;
      publishedForAllNames.push(finalComp.name);
    } else if (publishedCount > 0) {
      status = 'published_some';
    }

    items.push({
      id: finalComp.id,
      name: finalComp.name,
      weight: finalComp.weight,
      status,
      publishedCount,
      totalStudents,
      publishedPct: Number(pct.toFixed(1)),
    });
  }

  const allPublishedCount = items.filter((i) => i.status === 'published_all').length;
  const somePublishedCount = items.filter((i) => i.status === 'published_some').length;
  const notPublishedCount = items.filter((i) => i.status === 'not_published').length;

  const fairComparingLabel =
    publishedForAllNames.length > 0
      ? `Comparing on: ${publishedForAllNames.join(' + ')} (${fairMarksAvailable} marks)`
      : 'No components published for 100% of class yet';

  return {
    components: items,
    allPublishedCount,
    somePublishedCount,
    notPublishedCount,
    fairMarksAvailable,
    totalCourseMarks: scheme.totalMarks,
    fairComparingLabel,
  };
}

/**
 * Computes Fair Comparison Score:
 * Ranks students ONLY on components that have been published for ALL of us.
 */
export function calculateFairScore(
  student: StudentRecord,
  scheme: AssessmentScheme,
  completeness: CompletenessReport
): { earned: number; totalAvailable: number; percentage: number } {
  let earned = 0;
  let totalAvailable = 0;

  for (const comp of scheme.components) {
    if (comp.type === 'single') {
      const statusItem = completeness.components.find((c) => c.id === comp.id);
      if (statusItem?.status === 'published_all') {
        const val = comp.isFinalExam ? student.finalMark : student.marks[comp.id];
        const num = val !== null && val !== undefined && !isNaN(val) ? val : 0;
        const max = comp.maxMarks || comp.weight;
        earned += (num / max) * comp.weight;
        totalAvailable += comp.weight;
      }
    } else if (comp.type === 'best_n_of_m' && comp.subComponents) {
      // Find subcomponents published for all
      const publishedSubs = comp.subComponents.filter((sub) => {
        const item = completeness.components.find((c) => c.id === sub.id);
        return item?.status === 'published_all';
      });

      if (publishedSubs.length > 0) {
        const scores = publishedSubs.map((sub) => {
          const val = student.marks[sub.id];
          return val !== null && val !== undefined && !isNaN(val)
            ? val / sub.maxMarks
            : 0;
        });
        scores.sort((a, b) => b - a);

        const bestN = Math.min(comp.bestN || 3, publishedSubs.length);
        const avg = scores.slice(0, bestN).reduce((a, b) => a + b, 0) / bestN;
        const scaledWeight = Math.round((comp.weight * publishedSubs.length) / comp.subComponents.length);
        earned += avg * scaledWeight;
        totalAvailable += scaledWeight;
      }
    }
  }

  const percentage = totalAvailable > 0 ? (earned / totalAvailable) * 100 : 0;

  return {
    earned: Number(earned.toFixed(2)),
    totalAvailable: Number(totalAvailable.toFixed(2)),
    percentage: Number(percentage.toFixed(1)),
  };
}

/**
 * Current vs Potential totals for a student:
 * Earned so far, marks still available, best case, worst case, and likely case.
 */
export function calculatePotentialTotals(
  student: StudentRecord,
  scheme: AssessmentScheme,
  classStats: ClassStatistics,
  manualExpectations?: Record<string, number>
): PotentialTotals {
  const calc = calculateStudentTarget(student, scheme);
  const earnedSoFar = calc.sessionalTotalEarned + (student.finalMark ?? 0);
  const marksAvailable = scheme.totalMarks - earnedSoFar;

  const bestCaseTotal = Number(
    (calc.bestCaseSessional + (student.finalMark ?? (scheme.components.find((c) => c.isFinalExam)?.weight || 60))).toFixed(2)
  );

  const worstCaseTotal = Number((calc.worstCaseSessional + (student.finalMark ?? 0)).toFixed(2));

  // Determine likely score for missing parts:
  // Expected % = own average % on published components blended with class average
  // weight on own data = publishedCount / (publishedCount + 2)
  const publishedRatios: number[] = [];
  calc.componentsBreakdown.forEach((cb) => {
    if (cb.isCompleted && cb.weight > 0) {
      publishedRatios.push(cb.earnedScaledMarks / cb.weight);
    }
  });

  const k = publishedRatios.length;
  const ownPublishedAvg = k > 0 ? publishedRatios.reduce((a, b) => a + b, 0) / k : 0.7;
  const classAvgPct =
    classStats.count > 0 && calc.sessionalWeightTotal > 0
      ? classStats.sessionalAverage / calc.sessionalWeightTotal
      : 0.7;

  const ownWeight = k / (k + 2);
  const blendedExpectedPct = ownWeight * ownPublishedAvg + (1 - ownWeight) * classAvgPct;

  let expectedRemainingMarks = 0;

  scheme.components.forEach((comp) => {
    if (comp.type === 'single') {
      const val = comp.isFinalExam ? student.finalMark : student.marks[comp.id];
      const isMissing = val === null || val === undefined || isNaN(val);
      if (isMissing) {
        if (manualExpectations && manualExpectations[comp.id] !== undefined) {
          expectedRemainingMarks += manualExpectations[comp.id];
        } else {
          expectedRemainingMarks += blendedExpectedPct * comp.weight;
        }
      }
    } else if (comp.type === 'best_n_of_m' && comp.subComponents) {
      const untakenSubs = comp.subComponents.filter((sub) => {
        const v = student.marks[sub.id];
        return v === null || v === undefined || isNaN(v);
      });
      if (untakenSubs.length > 0) {
        // Run what-if with expected scores
        const simulatedMarks = { ...student.marks };
        untakenSubs.forEach((sub) => {
          if (manualExpectations && manualExpectations[sub.id] !== undefined) {
            simulatedMarks[sub.id] = manualExpectations[sub.id];
          } else {
            simulatedMarks[sub.id] = blendedExpectedPct * sub.maxMarks;
          }
        });
        const simulatedBreakdown = calculateComponentEarned(comp, simulatedMarks);
        const currentBreakdown = calculateComponentEarned(comp, student.marks);
        const diff = Math.max(0, simulatedBreakdown.earnedScaledMarks - currentBreakdown.earnedScaledMarks);
        expectedRemainingMarks += diff;
      }
    }
  });

  const likelyTotal = Number((earnedSoFar + expectedRemainingMarks).toFixed(2));

  return {
    studentId: student.id,
    earnedSoFar: Number(earnedSoFar.toFixed(2)),
    marksAvailable: Number(marksAvailable.toFixed(2)),
    bestCaseTotal,
    worstCaseTotal,
    likelyTotal,
    rankEarned: 1, // populated by dual ranking
    rankLikely: 1,
  };
}

/**
 * Head-to-Head Comparison between "Me" and a specific target student.
 */
export function calculateHeadToHead(
  me: StudentRecord,
  them: StudentRecord,
  students: StudentRecord[],
  scheme: AssessmentScheme
): HeadToHeadReport {
  const ranked = calculateStudentRanks(students, scheme);
  const myRank = ranked.find((r) => r.student.id === me.id)?.rank || 1;
  const theirRank = ranked.find((r) => r.student.id === them.id)?.rank || 1;

  const myCalc = calculateStudentTarget(me, scheme);
  const theirCalc = calculateStudentTarget(them, scheme);

  const nonFinals = scheme.components.filter((c) => !c.isFinalExam);
  const componentsComparison: HeadToHeadReport['componentsComparison'] = [];

  let theirBiggestLead: { name: string; gap: number } | null = null;
  let myBiggestLead: { name: string; gap: number } | null = null;

  for (const comp of nonFinals) {
    const myComp = myCalc.componentsBreakdown.find((cb) => cb.componentId === comp.id);
    const theirComp = theirCalc.componentsBreakdown.find((cb) => cb.componentId === comp.id);

    const myScore = myComp ? myComp.earnedScaledMarks : 0;
    const theirScore = theirComp ? theirComp.earnedScaledMarks : 0;
    const gap = Number((myScore - theirScore).toFixed(2)); // positive = I lead

    let whoLeads: 'me' | 'them' | 'tied' = 'tied';
    if (gap > 0.05) whoLeads = 'me';
    else if (gap < -0.05) whoLeads = 'them';

    componentsComparison.push({
      componentId: comp.id,
      name: comp.name,
      myScore,
      theirScore,
      gap,
      whoLeads,
    });

    if (gap < -0.05) {
      const lead = Math.abs(gap);
      if (!theirBiggestLead || lead > theirBiggestLead.gap) {
        theirBiggestLead = { name: comp.name, gap: lead };
      }
    } else if (gap > 0.05) {
      if (!myBiggestLead || gap > myBiggestLead.gap) {
        myBiggestLead = { name: comp.name, gap };
      }
    }
  }

  const myTotal = myCalc.sessionalTotalEarned;
  const theirTotal = theirCalc.sessionalTotalEarned;
  const overallGap = Number((myTotal - theirTotal).toFixed(2)); // positive = I lead

  let whoIsAhead: HeadToHeadReport['whoIsAhead'] = 'tied';
  if (overallGap > 0.05) whoIsAhead = 'me';
  else if (overallGap < -0.05) whoIsAhead = 'them';

  const studentsBetween = Math.max(0, Math.abs(myRank - theirRank) - 1);

  // Overtake calculations
  const finalComp = scheme.components.find((c) => c.isFinalExam);
  const finalWeight = finalComp?.weight || 60;

  const myMaxPossible = myCalc.bestCaseSessional + finalWeight;
  const theirMaxPossible = theirCalc.bestCaseSessional + finalWeight;

  const canIOvertakeThemPossible = myMaxPossible >= theirTotal;
  const neededInFinalLikely = Math.max(
    0,
    Number((theirTotal - myTotal + (theirCalc.finalWeight * 0.75)).toFixed(1))
  );
  const neededInFinalBest = Math.max(0, Number((theirCalc.worstCaseSessional - myTotal).toFixed(1)));

  const canTheyOvertakeMePossible = theirMaxPossible >= myTotal;

  // Plain-English summary
  let summary = '';
  if (whoIsAhead === 'them') {
    const leadMarks = Math.abs(overallGap);
    summary = `${them.name} leads you by ${leadMarks} marks, mostly in ${theirBiggestLead ? `${theirBiggestLead.name} (+${theirBiggestLead.gap})` : 'sessional tests'}. You can overtake them if you score ${Math.max(1, leadMarks + 1)} more than them in the remaining exams.`;
  } else if (whoIsAhead === 'me') {
    summary = `You lead ${them.name} by ${overallGap} marks, with your biggest advantage in ${myBiggestLead ? `${myBiggestLead.name} (+${myBiggestLead.gap})` : 'sessional tests'}. Maintain your pace in the final exam to defend your rank #${myRank}.`;
  } else {
    summary = `You and ${them.name} are exactly tied with ${myTotal} marks! The remaining tests and final exam will decide who finishes ahead.`;
  }

  return {
    me,
    them,
    componentsComparison,
    myTotal,
    theirTotal,
    overallGap,
    whoIsAhead,
    theirRank,
    myRank,
    studentsBetween,
    theirBiggestLeadComponent: theirBiggestLead,
    myBiggestLeadComponent: myBiggestLead,
    canIOvertakeThem: {
      possible: canIOvertakeThemPossible,
      neededInFinalLikely,
      neededInFinalBest,
      summary: canIOvertakeThemPossible
        ? `You need ${neededInFinalLikely} marks in the final if they score their likely average.`
        : 'Mathematically uncatchable even with full marks.',
    },
    canTheyOvertakeMe: {
      possible: canTheyOvertakeMePossible,
      neededInFinalLikely: Math.max(0, Number((myTotal - theirTotal + 5).toFixed(1))),
      neededInFinalBest: 0,
      summary: canTheyOvertakeMePossible
        ? `They can catch you if they outscore you by ${Math.abs(overallGap)} marks in the final.`
        : 'They cannot catch you.',
    },
    plainEnglishSummary: summary,
  };
}

/**
 * Creates a dated history snapshot when uploading new results.
 */
export function createCourseSnapshot(
  students: StudentRecord[],
  scheme: AssessmentScheme,
  myRoll: string,
  filename: string
): CourseHistorySnapshot {
  const ranked = calculateStudentRanks(students, scheme);
  const me = ranked.find((r) => r.isMe || r.student.roll === myRoll) || ranked[0];
  const targetCalc = me ? calculateStudentTarget(me.student, scheme) : null;

  const completeness = detectCompleteness(students, scheme);

  return {
    id: `snap_${Date.now()}`,
    timestamp: Date.now(),
    dateFormatted: new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
    filename,
    myRoll,
    myRank: me ? me.rank : 1,
    mySessional: me ? me.sessionalScore : 0,
    neededFinalAPlus: targetCalc ? targetCalc.neededInFinal : 0,
    studentsCount: students.length,
    publishedCount: completeness.allPublishedCount + completeness.somePublishedCount,
  };
}

/**
 * Compares current results with previous snapshot:
 * rank delta, rivals who moved, newly filled cells, and new A+ requirement.
 */
export function calculateWhatChanged(
  previousSnapshot: CourseHistorySnapshot | null,
  currentSnapshot: CourseHistorySnapshot,
  prevStudents: StudentRecord[],
  currentStudents: StudentRecord[],
  scheme: AssessmentScheme
): WhatChangedReport {
  if (!previousSnapshot) {
    return {
      previousSnapshot: null,
      rankDelta: 0,
      sessionalDelta: 0,
      neededFinalDelta: 0,
      newlyPublishedComponents: [],
      newlyFilledCellsCount: 0,
      rivalsMoved: [],
    };
  }

  const rankDelta = previousSnapshot.myRank - currentSnapshot.myRank; // positive = gained ranks
  const sessionalDelta = Number((currentSnapshot.mySessional - previousSnapshot.mySessional).toFixed(2));
  const neededFinalDelta = Number((currentSnapshot.neededFinalAPlus - previousSnapshot.neededFinalAPlus).toFixed(2));

  // Check newly filled cells
  let newlyFilledCellsCount = 0;
  currentStudents.forEach((curr) => {
    const prev = prevStudents.find((p) => p.roll === curr.roll || p.name === curr.name);
    if (prev) {
      Object.keys(curr.marks).forEach((key) => {
        if (curr.marks[key] !== null && prev.marks[key] === null) {
          newlyFilledCellsCount++;
        }
      });
      if (curr.finalMark !== null && prev.finalMark === null) {
        newlyFilledCellsCount++;
      }
    }
  });

  // Track rivals who moved
  const prevRanked = calculateStudentRanks(prevStudents, scheme);
  const currRanked = calculateStudentRanks(currentStudents, scheme);

  const rivalsMoved: WhatChangedReport['rivalsMoved'] = [];
  currRanked.forEach((curr) => {
    const prev = prevRanked.find((p) => p.student.roll === curr.student.roll || p.student.name === curr.student.name);
    if (prev && prev.rank !== curr.rank) {
      rivalsMoved.push({
        name: curr.student.name,
        roll: curr.student.roll || '',
        prevRank: prev.rank,
        newRank: curr.rank,
        rankDelta: prev.rank - curr.rank,
      });
    }
  });

  return {
    previousSnapshot,
    rankDelta,
    sessionalDelta,
    neededFinalDelta,
    newlyPublishedComponents: [],
    newlyFilledCellsCount,
    rivalsMoved: rivalsMoved.slice(0, 5),
  };
}

/**
 * Competitor Radar & Rival Categorization
 */
export function calculateCompetitorAnalysis(
  meStudent: StudentRecord,
  students: StudentRecord[],
  scheme: AssessmentScheme,
  rivalConfig: RivalRuleConfig = { maxGapBehind: 3, maxGapOverall: 6 }
): {
  myRank: number;
  totalStudents: number;
  percentile: number;
  mySessionalScore: number;
  competitorsAbove: CompetitorComparisonItem[];
  competitorsBelow: CompetitorComparisonItem[];
  topRivals: CompetitorComparisonItem[];
  allCompetitors: CompetitorComparisonItem[];
} {
  const ranked = calculateStudentRanks(students, scheme);
  const myRankItem = ranked.find((r) => r.isMe || r.student.id === meStudent.id);

  if (!myRankItem) {
    return {
      myRank: 1,
      totalStudents: students.length,
      percentile: 100,
      mySessionalScore: 0,
      competitorsAbove: [],
      competitorsBelow: [],
      topRivals: [],
      allCompetitors: [],
    };
  }

  const myIndex = ranked.findIndex((r) => r.student.id === myRankItem.student.id);
  const myScore = myRankItem.sessionalScore;

  const myCalc = calculateStudentTarget(myRankItem.student, scheme);
  const nonFinals = scheme.components.filter((c) => !c.isFinalExam);

  const buildComparisonItem = (item: StudentRankItem): CompetitorComparisonItem => {
    const otherCalc = calculateStudentTarget(item.student, scheme);
    const overallGap = Number((item.sessionalScore - myScore).toFixed(2));

    const componentGaps: Record<string, number> = {};
    let beatsMeMost: { componentId: string; componentName: string; gap: number } | null = null;
    let iBeatMost: { componentId: string; componentName: string; gap: number } | null = null;

    for (const comp of nonFinals) {
      const myComp = myCalc.componentsBreakdown.find((cb) => cb.componentId === comp.id);
      const otherComp = otherCalc.componentsBreakdown.find((cb) => cb.componentId === comp.id);
      const myVal = myComp ? myComp.earnedScaledMarks : 0;
      const otherVal = otherComp ? otherComp.earnedScaledMarks : 0;
      const compGap = Number((otherVal - myVal).toFixed(2));
      componentGaps[comp.id] = compGap;

      if (compGap > 0) {
        if (!beatsMeMost || compGap > beatsMeMost.gap) {
          beatsMeMost = { componentId: comp.id, componentName: comp.name, gap: compGap };
        }
      } else if (compGap < 0) {
        const lead = Math.abs(compGap);
        if (!iBeatMost || lead > iBeatMost.gap) {
          iBeatMost = { componentId: comp.id, componentName: comp.name, gap: lead };
        }
      }
    }

    let rivalCategory: CompetitorComparisonItem['rivalCategory'];
    if (overallGap > rivalConfig.maxGapOverall) {
      rivalCategory = 'Far Ahead';
    } else if (overallGap >= 0 && overallGap <= rivalConfig.maxGapOverall) {
      rivalCategory = 'Rival';
    } else if (
      overallGap < 0 &&
      Math.abs(overallGap) <= rivalConfig.maxGapBehind &&
      Math.abs(overallGap) <= rivalConfig.maxGapOverall
    ) {
      rivalCategory = 'Rival';
    } else if (overallGap < 0 && Math.abs(overallGap) <= rivalConfig.maxGapBehind) {
      rivalCategory = 'Close Behind';
    } else {
      rivalCategory = 'Behind';
    }

    const otherMaxAchievable = otherCalc.bestCaseSessional + otherCalc.finalWeight;
    const canOvertakeMe = overallGap < 0 && otherMaxAchievable >= myCalc.sessionalTotalEarned;

    const myMaxAchievable = myCalc.bestCaseSessional + myCalc.finalWeight;
    const canICatchThem = overallGap > 0 && myMaxAchievable >= item.sessionalScore;

    const maxPossibleCatchGap = Number((myMaxAchievable - item.sessionalScore).toFixed(2));

    return {
      student: item.student,
      rank: item.rank,
      sessionalScore: item.sessionalScore,
      overallGap,
      componentGaps,
      beatsMeMostComponent: beatsMeMost,
      iBeatThemMostComponent: iBeatMost,
      rivalCategory,
      canOvertakeMe,
      canICatchThem,
      maxPossibleCatchGap,
    };
  };

  const aboveSlice = ranked.slice(Math.max(0, myIndex - 5), myIndex);
  const competitorsAbove = aboveSlice.map(buildComparisonItem).reverse();

  const belowSlice = ranked.slice(myIndex + 1, myIndex + 6);
  const competitorsBelow = belowSlice.map(buildComparisonItem);

  const allItems = ranked
    .filter((r) => r.student.id !== myRankItem.student.id)
    .map(buildComparisonItem);

  const rivals = allItems
    .filter((c) => c.rivalCategory === 'Rival')
    .sort((a, b) => Math.abs(a.overallGap) - Math.abs(b.overallGap));

  return {
    myRank: myRankItem.rank,
    totalStudents: ranked.length,
    percentile: myRankItem.percentile,
    mySessionalScore: myScore,
    competitorsAbove,
    competitorsBelow,
    topRivals: rivals.slice(0, 5),
    allCompetitors: allItems,
  };
}

/**
 * Linear regression trend slopes across CT1 to CT4 for each student.
 */
export function calculateStudentTrends(
  students: StudentRecord[],
  scheme: AssessmentScheme
): {
  trends: StudentTrend[];
  mostImproved: StudentTrend[];
  fallingBehind: StudentTrend[];
} {
  const ctComp = scheme.components.find((c) => c.type === 'best_n_of_m');
  const subs = ctComp?.subComponents || [];

  const trends: StudentTrend[] = students.map((s) => {
    const rawScores = subs.map((sub) => {
      const v = s.marks[sub.id];
      return v !== null && v !== undefined && !isNaN(v) ? v : null;
    });

    const validPairs: { x: number; y: number }[] = [];
    rawScores.forEach((score, idx) => {
      if (score !== null) {
        validPairs.push({ x: idx + 1, y: score });
      }
    });

    let slope = 0;
    if (validPairs.length >= 2) {
      const n = validPairs.length;
      const sumX = validPairs.reduce((a, p) => a + p.x, 0);
      const sumY = validPairs.reduce((a, p) => a + p.y, 0);
      const sumXY = validPairs.reduce((a, p) => a + p.x * p.y, 0);
      const sumXX = validPairs.reduce((a, p) => a + p.x * p.x, 0);
      const denom = n * sumXX - sumX * sumX;
      slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
    }

    slope = Number(slope.toFixed(2));
    let direction: StudentTrend['direction'] = 'steady';
    if (slope > 0.4) direction = 'improving';
    else if (slope < -0.4) direction = 'declining';

    return {
      student: s,
      slope,
      direction,
      rawScores,
    };
  });

  const sortedBySlope = [...trends].sort((a, b) => b.slope - a.slope);
  const mostImproved = sortedBySlope.filter((t) => t.slope > 0.2).slice(0, 5);
  const fallingBehind = [...sortedBySlope].reverse().filter((t) => t.slope < -0.2).slice(0, 5);

  return { trends, mostImproved, fallingBehind };
}

/**
 * Deterministic Final Total Prediction Engine as a RANGE (low, likely, high).
 */
export function calculateFinalPredictions(
  meStudent: StudentRecord,
  students: StudentRecord[],
  scheme: AssessmentScheme
): PredictionResult {
  const finalComp = scheme.components.find((c) => c.isFinalExam);
  const finalWeight = finalComp ? finalComp.weight : 60;
  const nonFinals = scheme.components.filter((c) => !c.isFinalExam);
  const sessionalWeight = nonFinals.reduce((a, b) => a + b.weight, 0);

  const myCalc = calculateStudentTarget(meStudent, scheme);
  const mySessionalPct = sessionalWeight > 0 ? myCalc.sessionalTotalEarned / sessionalWeight : 0;

  const studentsWithFinal = students
    .map((s) => {
      const c = calculateStudentTarget(s, scheme);
      const sessPct = sessionalWeight > 0 ? c.sessionalTotalEarned / sessionalWeight : 0;
      return {
        student: s,
        sessPct,
        finalMark: s.finalMark,
        finalPct: s.finalMark !== null && s.finalMark !== undefined ? s.finalMark / finalWeight : null,
      };
    })
    .filter((item): item is { student: StudentRecord; sessPct: number; finalMark: number; finalPct: number } =>
      item.finalPct !== null && !isNaN(item.finalPct)
    );

  const n = studentsWithFinal.length;

  if (n >= 3) {
    const sumX = studentsWithFinal.reduce((a, b) => a + b.sessPct, 0);
    const sumY = studentsWithFinal.reduce((a, b) => a + b.finalPct, 0);
    const meanX = sumX / n;
    const meanY = sumY / n;

    let num = 0;
    let den = 0;
    studentsWithFinal.forEach((item) => {
      num += (item.sessPct - meanX) * (item.finalPct - meanY);
      den += Math.pow(item.sessPct - meanX, 2);
    });

    const beta = den !== 0 ? num / den : 1;
    const alpha = meanY - beta * meanX;

    const rawPredictedPct = alpha + beta * mySessionalPct;
    const clampedPredictedPct = Math.max(0.1, Math.min(1.0, rawPredictedPct));
    const likely = Number((clampedPredictedPct * finalWeight).toFixed(1));

    let ssRes = 0;
    studentsWithFinal.forEach((item) => {
      const pred = alpha + beta * item.sessPct;
      ssRes += Math.pow(item.finalPct - pred, 2);
    });
    const se = Math.sqrt(ssRes / (n > 2 ? n - 2 : 1));
    const margin = Math.max(2, se * finalWeight * 1.25);

    const low = Number(Math.max(0, likely - margin).toFixed(1));
    const high = Number(Math.min(finalWeight, likely + margin).toFixed(1));

    const confidence: PredictionResult['confidence'] = n >= 12 ? 'high' : 'medium';

    let ssTot = 0;
    studentsWithFinal.forEach((item) => {
      ssTot += Math.pow(item.finalPct - meanY, 2);
    });
    const rSquared = ssTot > 0 ? Number(Math.max(0, 1 - ssRes / ssTot).toFixed(2)) : 0.5;

    const neededForAPlus = scheme.targetGradeThreshold - myCalc.sessionalTotalEarned;

    let probAPlus = 0;
    if (neededForAPlus <= 0) probAPlus = 100;
    else if (neededForAPlus > finalWeight) probAPlus = 0;
    else {
      const z = (likely - neededForAPlus) / (margin || 1);
      probAPlus = Number((Math.min(100, Math.max(0, (0.5 * (1 + Math.tanh(z * 0.797885))) * 100))).toFixed(1));
    }

    return {
      estimatedFinalLow: low,
      estimatedFinalLikely: likely,
      estimatedFinalHigh: high,
      method: 'linear_regression',
      confidence,
      dataPointsUsed: n,
      explanation: `Fitted linear regression (R² = ${rSquared}) using ${n} classmates who completed finals. Shows likely score with 80% confidence interval.`,
      predictedRankLow: Math.max(1, Math.round(students.length * (1 - mySessionalPct) * 0.7)),
      predictedRankLikely: Math.max(1, Math.round(students.length * (1 - mySessionalPct))),
      predictedRankHigh: Math.min(students.length, Math.round(students.length * (1 - mySessionalPct) * 1.3) + 1),
      probabilityOfAPlus: probAPlus,
      rSquared,
    };
  }

  // Sessional Proxy Method
  const likely = Number((mySessionalPct * finalWeight).toFixed(1));
  const low = Number(Math.max(0, likely * 0.82).toFixed(1));
  const high = Number(Math.min(finalWeight, Math.max(likely * 1.15, likely + 4)).toFixed(1));

  const neededForAPlus = scheme.targetGradeThreshold - myCalc.sessionalTotalEarned;
  let probAPlus = 0;
  if (neededForAPlus <= 0) probAPlus = 100;
  else if (neededForAPlus > finalWeight) probAPlus = 0;
  else {
    const rangeSpan = Math.max(1, high - low);
    probAPlus = Number(
      (Math.min(100, Math.max(0, ((high - neededForAPlus) / rangeSpan) * 100))).toFixed(1)
    );
  }

  const confidence: PredictionResult['confidence'] = myCalc.hasPendingComponents ? 'low' : 'medium';

  return {
    estimatedFinalLow: low,
    estimatedFinalLikely: likely,
    estimatedFinalHigh: high,
    method: 'sessional_proxy',
    confidence,
    dataPointsUsed: 0,
    explanation: `Classmates have not taken the final exam yet. Estimated using your sessional average (${(mySessionalPct * 100).toFixed(1)}%) as proxy with a ±15% variance window.`,
    predictedRankLow: Math.max(1, Math.round(students.length * (1 - mySessionalPct) * 0.75)),
    predictedRankLikely: Math.max(1, Math.round(students.length * (1 - mySessionalPct))),
    predictedRankHigh: Math.min(students.length, Math.round(students.length * (1 - mySessionalPct) * 1.25) + 1),
    probabilityOfAPlus: probAPlus,
  };
}

/**
 * Generates 3 to 5 prioritized, rule-based recommendations.
 */
export function generateActionPlan(
  meStudent: StudentRecord,
  calc: TargetCalculation,
  stats: ClassStatistics,
  trends: ReturnType<typeof calculateStudentTrends>,
  competitors: ReturnType<typeof calculateCompetitorAnalysis>,
  scheme: AssessmentScheme
): ActionPlanItem[] {
  const items: ActionPlanItem[] = [];

  const myTrend = trends.trends.find((t) => t.student.id === meStudent.id);

  if (calc.verdict === 'reachable') {
    if (calc.neededPercentage > 85) {
      items.push({
        id: 'plan_final_critical',
        priority: 'high',
        title: `Target Final Exam: High Focus Required (${calc.neededInFinal}/${calc.finalWeight})`,
        rationale: `You need ${calc.neededInFinal} out of ${calc.finalWeight} (${calc.neededPercentage}%) for an A+. Focus on high-weight problem topics first.`,
        impactScore: calc.neededInFinal,
      });
    } else {
      items.push({
        id: 'plan_final_moderate',
        priority: 'high',
        title: `Secure ${calc.neededInFinal} marks in Semester Final`,
        rationale: `You need ${calc.neededInFinal} out of ${calc.finalWeight} (${calc.neededPercentage}%) to achieve your target ${scheme.targetGradeName} grade.`,
        impactScore: calc.neededInFinal,
      });
    }
  } else if (calc.verdict === 'secured') {
    items.push({
      id: 'plan_final_secured',
      priority: 'low',
      title: `A+ Already Secured: Protect Your Class Rank`,
      rationale: `Your sessional marks (${calc.sessionalTotalEarned}) alone pass the threshold. Focus on the final exam to maintain your rank (${competitors.myRank} of ${competitors.totalStudents}).`,
      impactScore: 0,
    });
  }

  if (myTrend && myTrend.direction === 'declining') {
    items.push({
      id: 'plan_ct_trend',
      priority: 'high',
      title: `Reverse Declining CT Trend (${myTrend.slope} marks/test)`,
      rationale: `Your CT trajectory is dropping by ${Math.abs(myTrend.slope)} marks per test. Review syllabus weaknesses before remaining tests or final.`,
      impactScore: Math.abs(myTrend.slope * 3),
    });
  } else if (myTrend && myTrend.direction === 'improving') {
    items.push({
      id: 'plan_ct_improving',
      priority: 'medium',
      title: `Maintain Upward CT Momentum (+${myTrend.slope} marks/test)`,
      rationale: `You are improving across consecutive tests. Keep the same study cadence through finals.`,
      impactScore: myTrend.slope * 2,
    });
  }

  const closeAhead = competitors.competitorsAbove.filter((c) => c.overallGap <= 2.5);
  if (closeAhead.length > 0) {
    const leadBeat = closeAhead[0].beatsMeMostComponent;
    const compName = leadBeat ? leadBeat.componentName : 'sessional tests';
    items.push({
      id: 'plan_fastest_gain',
      priority: 'medium',
      title: `Overtake ${closeAhead.length} Student${closeAhead.length > 1 ? 's' : ''} Just Ahead`,
      rationale: `${closeAhead.length} student${closeAhead.length > 1 ? 's are' : ' is'} within 2.5 marks of you. They lead most in ${compName}. Gaining ground here flips your rank.`,
      impactScore: closeAhead.length,
    });
  }

  if (stats.weakestComponent && stats.weakestComponent.zScore < 0) {
    items.push({
      id: 'plan_weakest_comp',
      priority: 'medium',
      title: `Boost Performance in ${stats.weakestComponent.name}`,
      rationale: `This is your lowest relative component (${Math.abs(stats.weakestComponent.diff)} marks below class average, z-score ${stats.weakestComponent.zScore}). Closing this gap offers highest upside.`,
      impactScore: Math.abs(stats.weakestComponent.diff),
    });
  }

  const closeBehind = competitors.competitorsBelow.filter((c) => Math.abs(c.overallGap) <= 1.5);
  if (closeBehind.length > 0) {
    items.push({
      id: 'plan_defend_rival',
      priority: 'low',
      title: `Maintain Cushion Against ${closeBehind.length} Close Rival${closeBehind.length > 1 ? 's' : ''}`,
      rationale: `${closeBehind.length} classmate${closeBehind.length > 1 ? 's are' : ' is'} within 1.5 marks behind you. Ensure full marks in assignments or attendance to protect your buffer.`,
      impactScore: 1.5,
    });
  }

  return items.slice(0, 5);
}
