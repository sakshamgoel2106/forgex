import React, { useState } from 'react';
import {
  GraduationCap,
  Plus,
  Search,
  User,
  ThumbsUp,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Modal } from '../ui/Modal';

interface ExpertNote {
  id: string;
  title: string;
  author: string;
  role: string;
  assetTag: string;
  category: 'RELIABILITY' | 'SAFETY_TIP' | 'TOOLING_HACK';
  content: string;
  date: string;
  upvotes: number;
}

const SAMPLE_NOTES: ExpertNote[] = [
  {
    id: 'exp-01',
    title: 'Pre-heating mechanical seal gland face prevents winter thermal shock',
    author: 'J. Kowalski (Sr. Millwright)',
    role: 'FIELD_SPECIALIST',
    assetTag: 'PUMP-204-B',
    category: 'RELIABILITY',
    content:
      'During sub-freezing ambient conditions at Plant TX-04, cold startup of Pump 204-B without steam tracing pre-heat cracks the silicon carbide seal face within 15 minutes. Always warm casing to > 40°C prior to releasing suction valve.',
    date: '2026-09-14',
    upvotes: 19,
  },
  {
    id: 'exp-02',
    title: 'Use brass feeler gauge only on 316SS gland gap to prevent galvanic pitting',
    author: 'T. Vance (Lead Reliability Eng)',
    role: 'PLANT_ENGINEER',
    assetTag: 'PUMP-204-B',
    category: 'TOOLING_HACK',
    content:
      'Carbon steel feeler gauges leave microscopic ferrous deposits on the 316SS gland follower that cause pitting corrosion under acidic condensate. Always use verified brass or non-magnetic gauges.',
    date: '2026-10-02',
    upvotes: 24,
  },
];

export const ExpertKnowledgeView: React.FC = () => {
  const [search, setSearch] = useState('');
  const [notes, setNotes] = useState<ExpertNote[]>(SAMPLE_NOTES);
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTag, setNewTag] = useState('PUMP-204-B');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<'RELIABILITY' | 'SAFETY_TIP' | 'TOOLING_HACK'>('RELIABILITY');

  const handleUpvote = (id: string) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, upvotes: n.upvotes + 1 } : n))
    );
  };

  const handleSubmitNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;

    const note: ExpertNote = {
      id: `exp-${Date.now()}`,
      title: newTitle.trim(),
      author: 'T. Vance (PE-7089)',
      role: 'PLANT_ENGINEER',
      assetTag: newTag.trim() || 'PLANT_WIDE',
      category: newCategory,
      content: newContent.trim(),
      date: new Date().toISOString().split('T')[0],
      upvotes: 1,
    };

    setNotes([note, ...notes]);
    setIsSubmitOpen(false);
    setNewTitle('');
    setNewContent('');
  };

  const filtered = notes.filter(
    (n) =>
      n.title.toLowerCase().includes(search.toLowerCase()) ||
      n.content.toLowerCase().includes(search.toLowerCase()) ||
      n.assetTag.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 p-5 md:p-6 overflow-y-auto bg-[#F5F6F7] space-y-6">
      {/* Top Banner Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-[#E2E8F0] gap-3">
        <div>
          <div className="flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-[#2563EB]" />
            <h2 className="text-base font-bold font-mono text-[#1A202C] uppercase tracking-wide">
              Tribal & Expert Knowledge Repository
            </h2>
          </div>
          <p className="text-xs text-[#64748B] mt-0.5 font-mono">
            Frontline field insights, lessons learned & undocumented machine behaviors
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={() => setIsSubmitOpen(true)}
          leftIcon={<Plus className="w-3.5 h-3.5" />}
          className="bg-[#151C24] text-white hover:bg-black font-bold rounded-lg shadow-sm"
        >
          Submit Field Note
        </Button>
      </div>

      {/* Search Bar */}
      <div className="max-w-md relative">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
        <input
          type="text"
          placeholder="Search expert notes by equipment or topic..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs font-mono text-[#1A202C] placeholder-[#94A3B8] focus:outline-none focus:border-[#2563EB] transition shadow-sm"
        />
      </div>

      {/* Grid of Expert Knowledge Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((note) => (
          <div key={note.id} className="rounded-xl border border-[#E2E8F0] bg-white p-5 space-y-3 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-[10px] font-mono text-[#2563EB] uppercase font-bold tracking-wider">
                  {note.category}
                </span>
                <h4 className="text-sm font-semibold text-[#1A202C] mt-0.5 leading-snug">
                  {note.title}
                </h4>
              </div>
              <span className="text-[10px] font-mono text-[#1E293B] bg-slate-100 px-2 py-0.5 rounded border border-[#E2E8F0] shrink-0 font-bold">
                {note.assetTag}
              </span>
            </div>

            <p className="text-xs text-[#475569] leading-relaxed font-sans">
              {note.content}
            </p>

            <div className="pt-3 border-t border-[#E2E8F0] flex items-center justify-between text-[11px] font-mono text-[#64748B]">
              <div className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-[#64748B]" />
                <span>{note.author}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="tabular-nums">{note.date}</span>
                <button
                  onClick={() => handleUpvote(note.id)}
                  className="flex items-center gap-1 text-[#2563EB] hover:underline font-bold"
                >
                  <ThumbsUp className="w-3 h-3" /> {note.upvotes}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Submit Field Note Modal */}
      <Modal
        isOpen={isSubmitOpen}
        onClose={() => setIsSubmitOpen(false)}
        title="Submit Frontline Expert Note"
        subtitle="Capture plant wisdom, non-standard tooling tips, or preventive observations"
      >
        <form onSubmit={handleSubmitNote} className="space-y-4">
          <div>
            <label className="block text-xs font-mono text-[#64748B] uppercase mb-1">
              Title / Subject
            </label>
            <input
              type="text"
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Always purge bypass loop before closing suction valve"
              className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs text-[#1A202C] placeholder-[#94A3B8] focus:outline-none focus:border-[#2563EB]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono text-[#64748B] uppercase mb-1">
                Equipment Tag
              </label>
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="PUMP-204-B"
                className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs text-[#1A202C] placeholder-[#94A3B8] focus:outline-none focus:border-[#2563EB] font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-[#64748B] uppercase mb-1">
                Category
              </label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as any)}
                className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs text-[#1A202C] focus:outline-none focus:border-[#2563EB] font-mono cursor-pointer"
              >
                <option value="RELIABILITY">Reliability</option>
                <option value="SAFETY_TIP">Safety Tip</option>
                <option value="TOOLING_HACK">Tooling Hack</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-[#64748B] uppercase mb-1">
              Observation & Field Guidance
            </label>
            <textarea
              required
              rows={4}
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Describe the operational symptom, root cause mechanism, and recommended field practice..."
              className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs text-[#1A202C] placeholder-[#94A3B8] focus:outline-none focus:border-[#2563EB] font-sans"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
            <Button variant="ghost" size="sm" type="button" onClick={() => setIsSubmitOpen(false)} className="text-[#64748B] hover:text-[#1A202C]">
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" className="bg-[#151C24] text-white hover:bg-black font-semibold rounded-lg shadow-sm">
              Publish Field Note
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
