import React, { useState } from 'react';
import { AssessmentScheme, GradeThreshold, SchemeComponent, SubComponent } from '../types';
import { DEFAULT_ASSESSMENT_SCHEME, DEFAULT_GRADE_THRESHOLDS } from '../data/defaultScheme';
import { Plus, Trash2, RotateCcw, AlertTriangle, CheckCircle, Sliders } from 'lucide-react';
import { useFeedback } from './FeedbackSystem';

interface SchemeEditorProps {
  scheme: AssessmentScheme;
  onUpdateScheme: (newScheme: AssessmentScheme) => void;
}

export const SchemeEditor: React.FC<SchemeEditorProps> = ({ scheme, onUpdateScheme }) => {
  const { showAlert, showConfirm, showToast } = useFeedback();
  const [activeTab, setActiveTab] = useState<'components' | 'grades'>('components');

  // Compute weight totals
  const totalComponentWeight = scheme.components.reduce((acc, c) => acc + (Number(c.weight) || 0), 0);
  const finalComp = scheme.components.find((c) => c.isFinalExam);
  const sessionalWeight = scheme.components
    .filter((c) => !c.isFinalExam)
    .reduce((acc, c) => acc + (Number(c.weight) || 0), 0);

  const isBalanced = totalComponentWeight === scheme.totalMarks;

  const handleUpdateCourseInfo = (field: keyof AssessmentScheme, value: string | number) => {
    onUpdateScheme({
      ...scheme,
      [field]: value,
    });
  };

  const handleUpdateComponent = (index: number, updated: Partial<SchemeComponent>) => {
    const updatedComponents = [...scheme.components];
    updatedComponents[index] = { ...updatedComponents[index], ...updated };
    onUpdateScheme({ ...scheme, components: updatedComponents });
  };

  const handleAddComponent = () => {
    const newId = `comp_${Date.now()}`;
    const newComponent: SchemeComponent = {
      id: newId,
      name: 'New Component (e.g. Midterm / Quiz)',
      type: 'single',
      weight: 10,
      maxMarks: 10,
      isFinalExam: false,
    };
    onUpdateScheme({
      ...scheme,
      components: [...scheme.components, newComponent],
    });
    showToast('Added new assessment component.', 'success');
  };

  const handleRemoveComponent = (index: number) => {
    if (scheme.components[index].isFinalExam) {
      showAlert(
        'Action Restricted',
        'The Semester Final component cannot be deleted because it is the target exam for this calculator.'
      );
      return;
    }
    const filtered = scheme.components.filter((_, i) => i !== index);
    onUpdateScheme({ ...scheme, components: filtered });
    showToast('Component removed.', 'info');
  };

  const handleAddSubComponent = (compIndex: number) => {
    const comp = scheme.components[compIndex];
    const subs = comp.subComponents || [];
    const newSubIndex = subs.length + 1;
    const newSub: SubComponent = {
      id: `${comp.id}${newSubIndex}`,
      name: `CT ${newSubIndex}`,
      maxMarks: 20,
    };
    handleUpdateComponent(compIndex, {
      subComponents: [...subs, newSub],
    });
  };

  const handleRemoveSubComponent = (compIndex: number, subIndex: number) => {
    const comp = scheme.components[compIndex];
    const subs = (comp.subComponents || []).filter((_, i) => i !== subIndex);
    const newBestN = Math.min(comp.bestN || 1, Math.max(1, subs.length));
    handleUpdateComponent(compIndex, {
      subComponents: subs,
      bestN: newBestN,
    });
  };

  const handleUpdateSubComponent = (
    compIndex: number,
    subIndex: number,
    field: keyof SubComponent,
    val: string | number
  ) => {
    const comp = scheme.components[compIndex];
    const subs = [...(comp.subComponents || [])];
    subs[subIndex] = { ...subs[subIndex], [field]: val };
    handleUpdateComponent(compIndex, { subComponents: subs });
  };

  const handleUpdateGradeThreshold = (index: number, minMarks: number) => {
    const updated = [...scheme.gradeThresholds];
    updated[index] = { ...updated[index], minMarks };
    onUpdateScheme({ ...scheme, gradeThresholds: updated });
  };

  const handleResetToDefaults = () => {
    showConfirm({
      title: 'Reset Assessment Scheme',
      message: 'Are you sure you want to restore the entire course assessment distribution to standard university defaults (Attendance: 10, CT: Best 3 of 4, Assignment: 10, Final: 60)?',
      confirmLabel: 'Reset to Defaults',
      isDestructive: true,
      onConfirm: () => {
        onUpdateScheme(DEFAULT_ASSESSMENT_SCHEME);
        showToast('Assessment scheme restored to university defaults.', 'success');
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Course Info & Target Setting Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
                Course Configuration
              </span>
              <span className="text-slate-300">·</span>
              <span className="text-xs text-slate-500 font-mono">
                {scheme.courseCode || 'CSE 301'}
              </span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 mt-1">
              Assessment Scheme & Weight Distribution
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Customize course components, weights, &quot;best N of M&quot; class test rules, and target thresholds.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleResetToDefaults}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Defaults
            </button>
          </div>
        </div>

        {/* Course Details Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Course Code
            </label>
            <input
              type="text"
              value={scheme.courseCode}
              onChange={(e) => handleUpdateCourseInfo('courseCode', e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              placeholder="e.g. CSE 301"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Course Title
            </label>
            <input
              type="text"
              value={scheme.courseName}
              onChange={(e) => handleUpdateCourseInfo('courseName', e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. Database Systems"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Target Grade Threshold ({scheme.targetGradeName})
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max={scheme.totalMarks}
                value={scheme.targetGradeThreshold}
                onChange={(e) => handleUpdateCourseInfo('targetGradeThreshold', Number(e.target.value))}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono tabular-nums"
              />
              <span className="text-xs text-slate-500 font-mono">/ {scheme.totalMarks}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Target Grade Symbol
            </label>
            <select
              value={scheme.targetGradeName}
              onChange={(e) => {
                const grade = e.target.value;
                const match = scheme.gradeThresholds.find((g) => g.grade === grade);
                onUpdateScheme({
                  ...scheme,
                  targetGradeName: grade,
                  targetGradeThreshold: match ? match.minMarks : scheme.targetGradeThreshold,
                });
              }}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
            >
              {scheme.gradeThresholds.map((g) => (
                <option key={g.grade} value={g.grade}>
                  {g.grade} (min {g.minMarks} marks)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Weights Balance Health Indicator */}
        <div className={`mt-4 p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs ${
          isBalanced
            ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
            : 'bg-amber-50 border-amber-200 text-amber-900'
        }`}>
          <div className="flex items-center gap-2">
            {isBalanced ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            )}
            <span>
              <strong>Total Marks Distribution:</strong> Sessional Components:{' '}
              <span className="font-mono font-semibold">{sessionalWeight}</span> + Final Exam:{' '}
              <span className="font-mono font-semibold">{finalComp?.weight || 0}</span> ={' '}
              <span className="font-mono font-bold">{totalComponentWeight}</span> / {scheme.totalMarks} marks.
            </span>
          </div>

          {!isBalanced && (
            <span className="text-amber-800 font-medium">
              Component weights sum to {totalComponentWeight}. Adjust components so they sum to {scheme.totalMarks}.
            </span>
          )}
        </div>
      </div>

      {/* Editor Sub-Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('components')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
            activeTab === 'components'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
          }`}
        >
          Assessment Components ({scheme.components.length})
        </button>
        <button
          onClick={() => setActiveTab('grades')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
            activeTab === 'grades'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
          }`}
        >
          Grade Boundaries ({scheme.gradeThresholds.length})
        </button>
      </div>

      {/* TAB 1: COMPONENTS EDITOR */}
      {activeTab === 'components' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-800">
              Course Assessment Breakdown
            </span>
            <button
              onClick={handleAddComponent}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Component
            </button>
          </div>

          <div className="space-y-3">
            {scheme.components.map((comp, compIdx) => (
              <div
                key={comp.id}
                className={`bg-white rounded-xl border p-4 sm:p-5 transition-shadow ${
                  comp.isFinalExam ? 'border-indigo-300 bg-indigo-50/20' : 'border-slate-200'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Left: Component Title and Type */}
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                    <div className="sm:col-span-5">
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">
                        Component Name
                      </label>
                      <input
                        type="text"
                        value={comp.name}
                        onChange={(e) => handleUpdateComponent(compIdx, { name: e.target.value })}
                        className="w-full px-3 py-1.5 text-sm font-medium bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">
                        Calculation Rule
                      </label>
                      <select
                        value={comp.type}
                        disabled={comp.isFinalExam}
                        onChange={(e) => {
                          const newType = e.target.value as 'single' | 'best_n_of_m';
                          if (newType === 'best_n_of_m' && !comp.subComponents) {
                            handleUpdateComponent(compIdx, {
                              type: newType,
                              bestN: 3,
                              subComponents: [
                                { id: `${comp.id}1`, name: 'CT 1', maxMarks: 20 },
                                { id: `${comp.id}2`, name: 'CT 2', maxMarks: 20 },
                                { id: `${comp.id}3`, name: 'CT 3', maxMarks: 20 },
                                { id: `${comp.id}4`, name: 'CT 4', maxMarks: 20 },
                              ],
                            });
                          } else {
                            handleUpdateComponent(compIdx, { type: newType });
                          }
                        }}
                        className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="single">Single Score</option>
                        <option value="best_n_of_m">Best N of M Tests</option>
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">
                        Weight in Total
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={comp.weight}
                        onChange={(e) => handleUpdateComponent(compIdx, { weight: Number(e.target.value) })}
                        className="w-full px-3 py-1.5 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">
                        {comp.type === 'single' ? 'Max Marks' : 'Scaled Marks'}
                      </label>
                      {comp.type === 'single' ? (
                        <input
                          type="number"
                          min="1"
                          max="200"
                          value={comp.maxMarks || comp.weight}
                          onChange={(e) => handleUpdateComponent(compIdx, { maxMarks: Number(e.target.value) })}
                          className="w-full px-3 py-1.5 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      ) : (
                        <span className="inline-block py-1.5 text-xs text-slate-600 font-mono">
                          Scaled to {comp.weight}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-3 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                    {comp.isFinalExam ? (
                      <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-100/60 px-2.5 py-1 rounded-md">
                        Target Final Exam
                      </span>
                    ) : (
                      <button
                        onClick={() => handleRemoveComponent(compIdx)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Remove component"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Sub-Components View for Best N of M */}
                {comp.type === 'best_n_of_m' && (
                  <div className="mt-4 pt-4 border-t border-slate-100 bg-slate-50/70 p-3.5 rounded-lg space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs text-slate-700">
                        <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Take the</span>
                        <input
                          type="number"
                          min="1"
                          max={comp.subComponents?.length || 1}
                          value={comp.bestN || 3}
                          onChange={(e) => handleUpdateComponent(compIdx, { bestN: Number(e.target.value) })}
                          className="w-14 px-2 py-1 text-xs font-mono font-semibold bg-white border border-slate-300 rounded text-center"
                        />
                        <span>best scores out of {comp.subComponents?.length || 0} held tests, averaged and scaled to {comp.weight} marks.</span>
                      </div>

                      <button
                        onClick={() => handleAddSubComponent(compIdx)}
                        className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                      >
                        <Plus className="w-3 h-3" />
                        Add Test / CT
                      </button>
                    </div>

                    {/* Subcomponents Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-1">
                      {(comp.subComponents || []).map((sub, subIdx) => (
                        <div
                          key={sub.id}
                          className="flex items-center justify-between gap-2 bg-white px-2.5 py-1.5 rounded-md border border-slate-200 text-xs"
                        >
                          <div className="flex-1 min-w-0">
                            <input
                              type="text"
                              value={sub.name}
                              onChange={(e) => handleUpdateSubComponent(compIdx, subIdx, 'name', e.target.value)}
                              className="w-full text-xs font-medium text-slate-800 bg-transparent border-none focus:outline-none"
                            />
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[10px] text-slate-400">max:</span>
                            <input
                              type="number"
                              min="1"
                              max="100"
                              value={sub.maxMarks}
                              onChange={(e) => handleUpdateSubComponent(compIdx, subIdx, 'maxMarks', Number(e.target.value))}
                              className="w-12 px-1 py-0.5 text-xs text-right font-mono bg-slate-50 border border-slate-200 rounded"
                            />
                            {(comp.subComponents || []).length > 1 && (
                              <button
                                onClick={() => handleRemoveSubComponent(compIdx, subIdx)}
                                className="text-slate-400 hover:text-rose-500 ml-1"
                              >
                                &times;
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: GRADE BOUNDARIES */}
      {activeTab === 'grades' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Grading Scale & Cutoffs</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Set minimum total marks required for each letter grade out of {scheme.totalMarks}.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 px-3 font-semibold">Grade</th>
                  <th className="py-2.5 px-3 font-semibold">Minimum Marks Required</th>
                  <th className="py-2.5 px-3 font-semibold">Percentage Equivalent</th>
                  <th className="py-2.5 px-3 font-semibold">Target Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {scheme.gradeThresholds.map((gt, idx) => (
                  <tr key={gt.grade} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-3 font-bold text-slate-900">
                      <span className="inline-block px-2.5 py-0.5 bg-slate-100 rounded text-xs font-mono">
                        {gt.grade}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <input
                        type="number"
                        min="0"
                        max={scheme.totalMarks}
                        value={gt.minMarks}
                        onChange={(e) => handleUpdateGradeThreshold(idx, Number(e.target.value))}
                        className="w-24 px-2.5 py-1 text-xs font-mono font-semibold bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-600">
                      {((gt.minMarks / scheme.totalMarks) * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3">
                      {gt.grade === scheme.targetGradeName ? (
                        <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                          Current Primary Target
                        </span>
                      ) : (
                        <button
                          onClick={() => {
                            onUpdateScheme({
                              ...scheme,
                              targetGradeName: gt.grade,
                              targetGradeThreshold: gt.minMarks,
                            });
                          }}
                          className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline"
                        >
                          Set as primary target
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
