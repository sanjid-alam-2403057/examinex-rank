import { DEFAULT_ASSESSMENT_SCHEME } from './defaultScheme';
import { suggestColumnMappings, tokenizeCsv, validateAndParseRecords } from '../algorithms/csvParser';
import { StudentRecord } from '../types';

/**
 * Standard CSV Template with roll, name, and sample rows.
 */
export const CSV_TEMPLATE_STRING = `roll,name,attendance,ct1,ct2,ct3,ct4,assignment,final
"2021001","Sanjid (Me)",10,18,17,19,,9,
"2021002","ফারহান আহমেদ",9,16,15,18,,8,
"2021003","নাবিলা চৌধুরী",10,19,20,18,,10,
"2021004","Tariqul Islam",8,14,12,15,,7,
"2021005","সাদিয়া আফরিন",10,19,18,20,,9.5,
`;

/**
 * Realistic university class dataset (20 students) with rolls, English & Bangla names,
 * attendance, CT scores, assignment marks, and some final marks.
 */
export const DEMO_CSV_STRING = `roll,name,is_me,attendance,ct1,ct2,ct3,ct4,assignment,final
"2021001","নাবিলা চৌধুরী",FALSE,10,19,20,19,20,10,54
"2021002","সাদিয়া আফরিন",FALSE,10,19,18,20,19,9.5,52
"2021003","Tahsin Rahman",FALSE,10,18,17,18,19,9.5,49
"2021004","Fariha Zaman",FALSE,10,19,19,18,18,9.5,50
"2021005","Sanjid (Me)",TRUE,9.5,18,16,19,,9,
"2021006","Anika Tabassum",FALSE,9.5,17,18,16,17,9,47
"2021007","ফারহান আহমেদ",FALSE,9,16,17,15,18,8.5,44
"2021008","Tasnim Jahan",FALSE,9,17,16,18,17,9,46
"2021009","Nusrat Sharmin",FALSE,9.5,18,17,16,18,8.5,
"2021010","Kazi Ariful Islam",FALSE,9,16,16,17,16,8.5,
"2021011","Zubair Hossain",FALSE,8,15,14,16,15,8,42
"2021012","Mahir Faysal",FALSE,9,15,16,17,16,8,
"2021013","Mehedi Hasan",FALSE,8.5,14,15,13,15,7.5,38
"2021014","শাহরিয়ার কবির",FALSE,7.5,12,13,14,15,7,
"2021015","Rashedul Karim",FALSE,8,13,15,12,14,7,36
"2021016","Tanvir Hasan",FALSE,7,11,13,12,13,6.5,
"2021017","রাশেদা আক্তার",FALSE,9,16,17,18,17,9,
"2021018","Ashiqur Rahman",FALSE,8.5,15,14,15,16,8,
"2021019","তামান্না হক",FALSE,9.5,17,18,19,18,9,
"2021020","Imtiaz Mahmud",FALSE,8,14,13,15,14,7.5,
`;

/**
 * Get pre-parsed demo students
 */
export function getDemoStudents(): StudentRecord[] {
  const tokens = tokenizeCsv(DEMO_CSV_STRING);
  const mappings = suggestColumnMappings(tokens[0], DEFAULT_ASSESSMENT_SCHEME);
  const result = validateAndParseRecords(tokens, mappings, DEFAULT_ASSESSMENT_SCHEME, 'missing');
  return result.students;
}

/**
 * Trigger browser file download for CSV content
 */
export function downloadCsvFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
