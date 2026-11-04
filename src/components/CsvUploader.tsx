import React, { useState, useRef, useEffect } from 'react';
import {
  AssessmentScheme,
  ColumnMapping,
  ParseResult,
  StudentRecord,
  ValidationError,
} from '../types';
import { suggestColumnMappings, tokenizeCsv, validateAndParseRecords } from '../algorithms/csvParser';
import { CSV_TEMPLATE_STRING, DEMO_CSV_STRING, downloadCsvFile } from '../data/demoData';
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  ArrowRight,
  Eye,
  UserCheck,
} from 'lucide-react';
import { useFeedback } from './FeedbackSystem';

interface CsvUploaderProps {
  scheme: AssessmentScheme;
  onDataLoaded: (students: StudentRecord[], filename: string) => void;
  currentStudentsCount: number;
  currentMeStudent?: StudentRecord;
}

export const CsvUploader: React.FC<CsvUploaderProps> = ({
  scheme,
  onDataLoaded,
  currentStudentsCount,
  currentMeStudent,
}) => {
  const { showAlert, showToast } = useFeedback();
  const [dragOver, setDragOver] = useState(false);
  const [rawCsvText, setRawCsvText] = useState<string>('');
  const [currentFileName, setCurrentFileName] = useState<string>('');
  const [tokenizedRows, setTokenizedRows] = useState<string[][]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [isMappingMode, setIsMappingMode] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [selectedMeId, setSelectedMeId] = useState<string>('');
  const [showTemplatePreview, setShowTemplatePreview] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Available scheme target options for column mapping
  const availableTargetOptions: { id: string; label: string }[] = [
    { id: 'ignore', label: '-- Do Not Import (Ignore) --' },
    { id: 'name', label: 'Student Name (Required)' },
    { id: 'is_me', label: 'Is Me Indicator (TRUE / FALSE)' },
  ];

  scheme.components.forEach((c) => {
    if (c.type === 'single') {
      availableTargetOptions.push({
        id: c.id,
        label: `${c.name} (${c.weight} marks)`,
      });
    } else if (c.subComponents) {
      c.subComponents.forEach((sub) => {
        availableTargetOptions.push({
          id: sub.id,
          label: `${c.name} -> ${sub.name} (max ${sub.maxMarks})`,
        });
      });
    }
  });

  const handleProcessCsvText = (text: string, filename: string) => {
    setRawCsvText(text);
    setCurrentFileName(filename);
    const rows = tokenizeCsv(text);

    if (rows.length < 2) {
      setParseResult({
        success: false,
        students: [],
        errors: [{ row: 1, message: 'The uploaded CSV file is empty or has only a header row.', severity: 'error' }],
        warnings: [],
        detectedColumns: [],
        suggestedMappings: [],
        unmappedColumns: [],
        rawRowsCount: 0,
      });
      setIsMappingMode(false);
      return;
    }

    setTokenizedRows(rows);
    const headers = rows[0];
    const initialMappings = suggestColumnMappings(headers, scheme);
    setMappings(initialMappings);

    // Initial validation
    const result = validateAndParseRecords(rows, initialMappings, scheme);
    setParseResult(result);
    setIsMappingMode(true);

    // If a student is already marked as me, sync selectedMeId
    const foundMe = result.students.find((s) => s.isMe);
    if (foundMe) {
      setSelectedMeId(foundMe.id);
    } else if (result.students.length > 0) {
      setSelectedMeId(result.students[0].id);
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      readFile(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      readFile(file);
    }
  };

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      handleProcessCsvText(content, file.name);
    };
    reader.readAsText(file);
  };

  const handleMappingChange = (csvCol: string, targetFieldId: string) => {
    const updated = mappings.map((m) =>
      m.csvColumn === csvCol
        ? { ...m, targetFieldId, isIgnored: targetFieldId === 'ignore' }
        : m
    );
    setMappings(updated);

    // Revalidate with new mappings
    if (tokenizedRows.length > 0) {
      const result = validateAndParseRecords(tokenizedRows, updated, scheme);
      setParseResult(result);
    }
  };

  const handleManualSelectMe = (studentId: string) => {
    setSelectedMeId(studentId);
    if (parseResult) {
      const updatedStudents = parseResult.students.map((s) => ({
        ...s,
        isMe: s.id === studentId,
      }));
      setParseResult({
        ...parseResult,
        students: updatedStudents,
        warnings: parseResult.warnings.filter((w) => w.column !== 'is_me'),
      });
    }
  };

  const handleConfirmImport = () => {
    if (!parseResult) return;

    let finalStudents = [...parseResult.students];

    // Ensure one student is flagged as me
    const meCount = finalStudents.filter((s) => s.isMe).length;
    if (meCount === 0 && selectedMeId) {
      finalStudents = finalStudents.map((s) => ({
        ...s,
        isMe: s.id === selectedMeId,
      }));
    }

    if (finalStudents.filter((s) => s.isMe).length !== 1) {
      showAlert(
        'Identity Required',
        'Please select exactly one student row as "Me" from the dropdown before completing the import.'
      );
      return;
    }

    onDataLoaded(finalStudents, currentFileName || 'uploaded_class.csv');
    showToast(`Successfully imported ${finalStudents.length} student records.`, 'success');
    setIsMappingMode(false);
  };

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
                Data Ingestion
              </span>
              <span className="text-slate-300">·</span>
              <span className="text-xs text-slate-500 font-mono">Browser Session Safe</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 mt-1">
              Course CSV Upload & Column Mapping
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Upload class marks. Blank cells are treated as &quot;not yet taken&quot; (never zero).
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => downloadCsvFile(CSV_TEMPLATE_STRING, 'examinex_course_template.csv')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download CSV Template
            </button>

            <button
              onClick={() => downloadCsvFile(DEMO_CSV_STRING, 'examinex_sample_marks.csv')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download Sample CSV
            </button>
          </div>
        </div>

        {/* Current Data Status Banner */}
        {currentStudentsCount > 0 && !isMappingMode && (
          <div className="mt-4 p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg flex items-center justify-between text-xs text-emerald-900">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Currently active dataset contains <strong>{currentStudentsCount} students</strong>.
                {currentMeStudent && (
                  <span>
                    {' '}You are designated as: <strong>{currentMeStudent.name}</strong>.
                  </span>
                )}
              </span>
            </div>
            <span className="text-[11px] font-mono text-emerald-700">Ready for Calculations</span>
          </div>
        )}
      </div>

      {/* Main Drag & Drop Zone */}
      {!isMappingMode && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleFileDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 sm:p-12 text-center cursor-pointer transition-all ${
            dragOver
              ? 'border-indigo-500 bg-indigo-50/50 scale-[0.99]'
              : 'border-slate-300 hover:border-indigo-400 bg-white hover:bg-slate-50/50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={handleFileSelect}
            className="hidden"
          />
          <div className="max-w-md mx-auto space-y-3">
            <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
              <UploadCloud className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">
                Click to browse or drop your course CSV here
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Supports Excel CSV, UTF-8 BOM, custom headers, and comma-inside-quotes
              </p>
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              Expected: name, is_me, attendance, ct1, ct2, ct3, ct4, assignment, final
            </div>
          </div>
        </div>
      )}

      {/* Template Preview Drawer / Modal */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <button
          onClick={() => setShowTemplatePreview(!showTemplatePreview)}
          className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-indigo-600" />
            <span className="text-xs font-semibold text-slate-800">
              CSV Format Specifications & Rules
            </span>
          </div>
          <span className="text-xs text-indigo-600 font-medium">
            {showTemplatePreview ? 'Hide Guidelines' : 'View Format Guide & Sample'}
          </span>
        </button>

        {showTemplatePreview && (
          <div className="p-5 border-t border-slate-100 bg-slate-50/50 text-xs space-y-3">
            <p className="text-slate-600">
              Make sure your CSV has a header row. If your column names differ (e.g., &quot;Student Name&quot; instead of &quot;name&quot;),
              our column-mapping step will let you pair them easily.
            </p>

            <div className="bg-slate-900 text-slate-100 p-3 rounded-lg font-mono text-[11px] overflow-x-auto whitespace-pre">
              {CSV_TEMPLATE_STRING}
            </div>

            <ul className="list-disc list-inside space-y-1 text-slate-600">
              <li><strong>is_me column:</strong> Put <code>TRUE</code> for your own row, and <code>FALSE</code> for others. If omitted, you will be prompted to pick your name.</li>
              <li><strong>Blank cells:</strong> Leave exams that haven&apos;t happened yet completely blank. They are treated as missing/pending tests, NOT as zeros!</li>
              <li><strong>Final Exam:</strong> Keep the <code>final</code> column empty before semester finals happen.</li>
            </ul>
          </div>
        )}
      </div>

      {/* COLUMN MAPPING & VALIDATION SCREEN */}
      {isMappingMode && parseResult && (
        <div className="bg-white rounded-xl border border-indigo-200 p-5 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 font-mono">
                Step 2 of 2: Verification
              </span>
              <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                Column Mapping & File Validation
              </h2>
              <p className="text-xs text-slate-500">
                File: <strong className="text-slate-800">{currentFileName}</strong> ({tokenizedRows.length - 1} student rows detected)
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsMappingMode(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg"
              >
                Cancel / Choose Another File
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={parseResult.errors.length > 0}
                className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg text-white transition-all ${
                  parseResult.errors.length === 0
                    ? 'bg-indigo-600 hover:bg-indigo-700 shadow-xs'
                    : 'bg-slate-300 cursor-not-allowed'
                }`}
              >
                <span>Complete Import & Analyze</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Validation Status Notice */}
          {parseResult.errors.length > 0 ? (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-rose-800 font-bold text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>Found {parseResult.errors.length} validation errors that must be resolved:</span>
              </div>
              <ul className="space-y-1.5 max-h-48 overflow-y-auto pr-2 text-xs text-rose-700 font-mono">
                {parseResult.errors.map((err, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-rose-500 font-bold shrink-0">•</span>
                    <span>{err.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs text-emerald-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                All {parseResult.students.length} student records passed validation checks with zero errors!
              </span>
            </div>
          )}

          {/* "Who are you?" Selector if is_me is missing or needs selection */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-indigo-600" />
              <label className="text-xs font-bold text-slate-800">
                Designate Your Row (&quot;Me&quot;):
              </label>
            </div>
            <p className="text-xs text-slate-500">
              Select which row in this CSV represents your marks for target calculations.
            </p>
            <select
              value={selectedMeId}
              onChange={(e) => handleManualSelectMe(e.target.value)}
              className="w-full sm:w-96 px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {parseResult.students.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name} {st.isMe ? ' (Marked as Me in CSV)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Column Mapping Table */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Map CSV Headers to Course Components
            </h3>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-2.5 px-4">CSV Column Header</th>
                    <th className="py-2.5 px-4">Sample Value (Row 1)</th>
                    <th className="py-2.5 px-4">Mapped Scheme Component</th>
                    <th className="py-2.5 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {mappings.map((mapping, idx) => {
                    const sampleVal = tokenizedRows[1]?.[idx] ?? '';
                    const isMapped = mapping.targetFieldId !== 'ignore';

                    return (
                      <tr key={mapping.csvColumn} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-4 font-mono font-medium text-slate-900">
                          {mapping.csvColumn}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-500">
                          {sampleVal === '' ? <span className="text-slate-300 italic">(blank)</span> : sampleVal}
                        </td>
                        <td className="py-2.5 px-4">
                          <select
                            value={mapping.targetFieldId}
                            onChange={(e) => handleMappingChange(mapping.csvColumn, e.target.value)}
                            className="w-full sm:w-64 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          >
                            {availableTargetOptions.map((opt) => (
                              <option key={opt.id} value={opt.id}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2.5 px-4">
                          {isMapped ? (
                            <span className="text-emerald-700 font-medium inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Mapped
                            </span>
                          ) : (
                            <span className="text-slate-400">Ignored</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
