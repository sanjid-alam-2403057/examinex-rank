import { AssessmentScheme, StudentRecord } from '../types';
import { calculateStudentTarget } from './targetCalculator';

export interface StudentRankItem {
  student: StudentRecord;
  sessionalScore: number;
  rank: number;
  denseRank: number;
  percentile: number;
  isMe: boolean;
}

/**
 * Computes standard competition ranking (1, 2, 2, 4) with tie handling
 * and percentiles.
 */
export function calculateStudentRanks(
  students: StudentRecord[],
  scheme: AssessmentScheme
): StudentRankItem[] {
  if (students.length === 0) return [];

  // Compute sessional score for each student
  const scored = students.map((s) => {
    const calc = calculateStudentTarget(s, scheme);
    return {
      student: s,
      sessionalScore: calc.sessionalTotalEarned,
      isMe: s.isMe,
    };
  });

  // Sort descending by sessional score (break ties by student name for stability)
  scored.sort((a, b) => {
    if (b.sessionalScore !== a.sessionalScore) {
      return b.sessionalScore - a.sessionalScore;
    }
    return a.student.name.localeCompare(b.student.name);
  });

  const total = scored.length;
  const result: StudentRankItem[] = [];

  let currentRank = 1;
  let denseRank = 1;

  for (let i = 0; i < total; i++) {
    if (i > 0) {
      const prev = scored[i - 1];
      const curr = scored[i];
      if (curr.sessionalScore < prev.sessionalScore) {
        currentRank = i + 1; // Standard competition rank: skips (e.g., 1, 2, 2, 4)
        denseRank++;
      }
      // If equal score, currentRank and denseRank remain identical to prev
    }

    // Percentile rank: percentage of students at or below this student's score
    // Standard definition: ((students with lower score + 0.5 * students with same score) / total) * 100
    // Or simplified: ((total - rank + 1) / total) * 100
    const percentile = Number((((total - currentRank + 1) / total) * 100).toFixed(1));

    result.push({
      student: scored[i].student,
      sessionalScore: scored[i].sessionalScore,
      rank: currentRank,
      denseRank,
      percentile,
      isMe: scored[i].isMe,
    });
  }

  return result;
}
