import { AssessmentScheme } from '../types';

export const DEFAULT_GRADE_THRESHOLDS = [
  { grade: 'A+', minMarks: 80, gpaPoint: 4.0 },
  { grade: 'A', minMarks: 75, gpaPoint: 3.75 },
  { grade: 'A-', minMarks: 70, gpaPoint: 3.5 },
  { grade: 'B+', minMarks: 65, gpaPoint: 3.25 },
  { grade: 'B', minMarks: 60, gpaPoint: 3.0 },
  { grade: 'B-', minMarks: 55, gpaPoint: 2.75 },
  { grade: 'C+', minMarks: 50, gpaPoint: 2.5 },
  { grade: 'C', minMarks: 45, gpaPoint: 2.25 },
  { grade: 'D', minMarks: 40, gpaPoint: 2.0 },
  { grade: 'F', minMarks: 0, gpaPoint: 0.0 },
];

export const DEFAULT_ASSESSMENT_SCHEME: AssessmentScheme = {
  id: 'cse301_default',
  courseName: 'Database Systems & Algorithms',
  courseCode: 'CSE 301',
  totalMarks: 100,
  targetGradeThreshold: 80,
  targetGradeName: 'A+',
  gradeThresholds: DEFAULT_GRADE_THRESHOLDS,
  components: [
    {
      id: 'attendance',
      name: 'Attendance',
      type: 'single',
      weight: 10,
      maxMarks: 10,
      isFinalExam: false,
    },
    {
      id: 'ct',
      name: 'Class Tests (Best 3 of 4)',
      type: 'best_n_of_m',
      weight: 20,
      bestN: 3,
      isFinalExam: false,
      subComponents: [
        { id: 'ct1', name: 'CT 1', maxMarks: 20 },
        { id: 'ct2', name: 'CT 2', maxMarks: 20 },
        { id: 'ct3', name: 'CT 3', maxMarks: 20 },
        { id: 'ct4', name: 'CT 4', maxMarks: 20 },
      ],
    },
    {
      id: 'assignment',
      name: 'Assignment',
      type: 'single',
      weight: 10,
      maxMarks: 10,
      isFinalExam: false,
    },
    {
      id: 'final',
      name: 'Semester Final Exam',
      type: 'single',
      weight: 60,
      maxMarks: 60,
      isFinalExam: true,
    },
  ],
};
