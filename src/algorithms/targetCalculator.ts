import {
  AssessmentScheme,
  ComponentBreakdown,
  GradeTargetResult,
  SchemeComponent,
  StudentRecord,
  TargetCalculation,
} from '../types';

/**
 * Pure deterministic calculation of marks earned for a single component.
 */
export function calculateComponentEarned(
  component: SchemeComponent,
  marks: Record<string, number | null>
): ComponentBreakdown {
  if (component.type === 'single') {
    const rawVal = marks[component.id];
    const isTaken = rawVal !== null && rawVal !== undefined && !isNaN(rawVal);
    const max = component.maxMarks || component.weight;
    const earnedScaled = isTaken ? (Math.max(0, rawVal) / max) * component.weight : 0;

    return {
      componentId: component.id,
      name: component.name,
      weight: component.weight,
      earnedScaledMarks: Number(earnedScaled.toFixed(2)),
      maxPossibleSoFar: component.weight,
      isCompleted: isTaken,
      notes: isTaken
        ? `${rawVal} / ${max} (${((rawVal / max) * 100).toFixed(1)}%)`
        : 'Not yet taken',
      takenCount: isTaken ? 1 : 0,
      totalCount: 1,
      subScores: [
        {
          id: component.id,
          name: component.name,
          rawScore: isTaken ? rawVal : null,
          maxScore: max,
          usedInBestN: isTaken,
        },
      ],
    };
  }

  // Best N of M type (e.g., Best 3 of 4 CTs)
  const subComponents = component.subComponents || [];
  const bestN = component.bestN || subComponents.length;

  const subScoreList = subComponents.map((sub) => {
    const raw = marks[sub.id];
    const isTaken = raw !== null && raw !== undefined && !isNaN(raw);
    const pct = isTaken ? raw / sub.maxMarks : -1;
    return {
      id: sub.id,
      name: sub.name,
      rawScore: isTaken ? raw : null,
      maxScore: sub.maxMarks,
      percentage: pct,
      isTaken,
    };
  });

  const takenSubs = subScoreList.filter((s) => s.isTaken);
  const takenCount = takenSubs.length;

  if (takenCount === 0) {
    return {
      componentId: component.id,
      name: component.name,
      weight: component.weight,
      earnedScaledMarks: 0,
      maxPossibleSoFar: component.weight,
      isCompleted: false,
      notes: `0 of ${subComponents.length} held so far`,
      takenCount: 0,
      totalCount: subComponents.length,
      subScores: subScoreList.map((s) => ({
        id: s.id,
        name: s.name,
        rawScore: null,
        maxScore: s.maxScore,
        usedInBestN: false,
      })),
    };
  }

  // Sort taken by percentage descending
  const sortedTaken = [...takenSubs].sort((a, b) => b.percentage - a.percentage);

  // Take up to bestN (or available if fewer than bestN)
  const numToTake = Math.min(bestN, takenCount);
  const usedItems = sortedTaken.slice(0, numToTake);
  const usedIds = new Set(usedItems.map((u) => u.id));

  // Average percentage of used items
  const avgPct =
    usedItems.reduce((acc, curr) => acc + curr.percentage, 0) / numToTake;
  const earnedScaled = avgPct * component.weight;

  let note = '';
  if (takenCount < bestN) {
    note = `${takenCount} of ${bestN} taken so far, using available ${takenCount}`;
  } else {
    const names = usedItems.map((u) => u.name).join(', ');
    note = `Best ${numToTake} of ${takenCount}: ${names}`;
  }

  return {
    componentId: component.id,
    name: component.name,
    weight: component.weight,
    earnedScaledMarks: Number(earnedScaled.toFixed(2)),
    maxPossibleSoFar: component.weight,
    isCompleted: takenCount === subComponents.length,
    notes: note,
    takenCount,
    totalCount: subComponents.length,
    subScores: subScoreList.map((s) => ({
      id: s.id,
      name: s.name,
      rawScore: s.rawScore,
      maxScore: s.maxScore,
      usedInBestN: usedIds.has(s.id),
    })),
  };
}

/**
 * Calculates Best Case and Worst Case Sessional totals given untaken components.
 */
export function calculateSessionalBounds(
  scheme: AssessmentScheme,
  currentMarks: Record<string, number | null>
): { bestCase: number; worstCase: number } {
  const nonFinals = scheme.components.filter((c) => !c.isFinalExam);

  let bestTotal = 0;
  let worstTotal = 0;

  for (const comp of nonFinals) {
    if (comp.type === 'single') {
      const val = currentMarks[comp.id];
      const isTaken = val !== null && val !== undefined && !isNaN(val);
      const max = comp.maxMarks || comp.weight;
      if (isTaken) {
        const earned = (Math.max(0, val) / max) * comp.weight;
        bestTotal += earned;
        worstTotal += earned;
      } else {
        // Untaken: best case is 100%, worst case is 0%
        bestTotal += comp.weight;
        worstTotal += 0;
      }
    } else {
      // Best N of M
      const subs = comp.subComponents || [];
      const bestN = comp.bestN || subs.length;

      // Best case scenario marks: replace null with full marks
      const bestScores = subs.map((sub) => {
        const val = currentMarks[sub.id];
        return val !== null && val !== undefined && !isNaN(val)
          ? val / sub.maxMarks
          : 1.0; // 100%
      });
      bestScores.sort((a, b) => b - a);
      const bestAvg =
        bestScores.slice(0, bestN).reduce((a, b) => a + b, 0) / bestN;
      bestTotal += bestAvg * comp.weight;

      // Worst case scenario marks: replace null with 0
      const worstScores = subs.map((sub) => {
        const val = currentMarks[sub.id];
        return val !== null && val !== undefined && !isNaN(val)
          ? val / sub.maxMarks
          : 0.0; // 0%
      });
      worstScores.sort((a, b) => b - a);
      const worstAvg =
        worstScores.slice(0, bestN).reduce((a, b) => a + b, 0) / bestN;
      worstTotal += worstAvg * comp.weight;
    }
  }

  return {
    bestCase: Number(bestTotal.toFixed(2)),
    worstCase: Number(worstTotal.toFixed(2)),
  };
}

/**
 * Determine difficulty level and styling categorizations
 */
function getDifficultyLevel(
  needed: number,
  finalWeight: number
): 'secured' | 'easy' | 'moderate' | 'challenging' | 'critical' | 'unreachable' {
  if (needed <= 0) return 'secured';
  if (needed > finalWeight) return 'unreachable';
  const pct = (needed / finalWeight) * 100;
  if (pct <= 50) return 'easy';
  if (pct <= 75) return 'moderate';
  if (pct <= 90) return 'challenging';
  return 'critical';
}

/**
 * Main Target Calculation for a student given an AssessmentScheme
 */
export function calculateStudentTarget(
  student: StudentRecord,
  scheme: AssessmentScheme,
  whatIfOverrides?: Record<string, number | null>
): TargetCalculation {
  const activeMarks = { ...student.marks, ...(whatIfOverrides || {}) };

  // Filter components
  const finalComp = scheme.components.find((c) => c.isFinalExam);
  const finalWeight = finalComp ? finalComp.weight : 60;
  const nonFinals = scheme.components.filter((c) => !c.isFinalExam);
  const sessionalWeightTotal = nonFinals.reduce((acc, c) => acc + c.weight, 0);

  // Compute breakdown per component
  const componentsBreakdown: ComponentBreakdown[] = nonFinals.map((comp) =>
    calculateComponentEarned(comp, activeMarks)
  );

  const sessionalTotalEarned = Number(
    componentsBreakdown
      .reduce((acc, c) => acc + c.earnedScaledMarks, 0)
      .toFixed(2)
  );

  const { bestCase: bestCaseSessional, worstCase: worstCaseSessional } =
    calculateSessionalBounds(scheme, activeMarks);

  const targetTotalMarks = scheme.targetGradeThreshold;
  const targetGradeName = scheme.targetGradeName || 'A+';

  const rawNeeded = targetTotalMarks - sessionalTotalEarned;
  const neededInFinal = Number(Math.max(0, rawNeeded).toFixed(2));
  const neededPercentage = Number(((neededInFinal / finalWeight) * 100).toFixed(1));

  let verdict: 'secured' | 'reachable' | 'unreachable';
  let verdictMessage: string;

  if (sessionalTotalEarned >= targetTotalMarks) {
    verdict = 'secured';
    verdictMessage = `Already secured! Sessional marks (${sessionalTotalEarned}) alone exceed the ${targetGradeName} threshold (${targetTotalMarks}).`;
  } else if (rawNeeded <= finalWeight) {
    verdict = 'reachable';
    verdictMessage = `Needs ${neededInFinal} out of ${finalWeight} (${neededPercentage}%) in semester final for ${targetGradeName}`;
  } else {
    verdict = 'unreachable';
    const maxPossible = sessionalTotalEarned + finalWeight;
    verdictMessage = `Not mathematically reachable. Sessional (${sessionalTotalEarned}) + Maximum Final (${finalWeight}) = ${maxPossible.toFixed(2)}, which is below ${targetTotalMarks}.`;
  }

  const difficulty = getDifficultyLevel(rawNeeded, finalWeight);

  // Best & Worst case final marks needed
  const bestCaseFinalNeeded = Number(
    Math.max(0, targetTotalMarks - bestCaseSessional).toFixed(2)
  );
  const worstCaseFinalNeeded = Number(
    Math.max(0, targetTotalMarks - worstCaseSessional).toFixed(2)
  );

  // All grade targets
  const allGradeTargets: GradeTargetResult[] = (scheme.gradeThresholds || []).map(
    (threshold) => {
      const needed = Number(Math.max(0, threshold.minMarks - sessionalTotalEarned).toFixed(2));
      const pct = Number(((needed / finalWeight) * 100).toFixed(1));
      const isSecured = sessionalTotalEarned >= threshold.minMarks;
      const isReachable = threshold.minMarks - sessionalTotalEarned <= finalWeight;

      return {
        grade: threshold.grade,
        minMarks: threshold.minMarks,
        neededInFinal: needed,
        finalPercentage: pct,
        isReachable,
        isAlreadySecured: isSecured,
        difficulty: getDifficultyLevel(threshold.minMarks - sessionalTotalEarned, finalWeight),
      };
    }
  );

  const hasPendingComponents = componentsBreakdown.some((c) => !c.isCompleted);

  return {
    student,
    sessionalTotalEarned,
    sessionalWeightTotal,
    finalWeight,
    targetTotalMarks,
    targetGradeName,
    neededInFinal,
    neededPercentage,
    verdict,
    verdictMessage,
    difficulty,
    bestCaseSessional,
    worstCaseSessional,
    bestCaseFinalNeeded,
    worstCaseFinalNeeded,
    componentsBreakdown,
    allGradeTargets,
    hasPendingComponents,
  };
}
