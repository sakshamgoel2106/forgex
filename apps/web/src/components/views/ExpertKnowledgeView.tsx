import React, { useState, useEffect } from 'react';
import {
  GraduationCap,
  Plus,
  Search,
  User,
  ThumbsUp,
  BookOpen,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Modal } from '../ui/Modal';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';

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

export const ExpertKnowledgeView: React.FC = () => {
  const { toast } = useToast();
  const { user, organization } = useAuth();
  const orgId = organization?.id || 'default_tenant';
  const storageKey = `forgex_expert_notes_${orgId}`;

  const [search, setSearch] = useState('');
  const [notes, setNotes] = useState<ExpertNote[]>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      setNotes(stored ? JSON.parse(stored) : []);
    } catch {
      setNotes([]);
    }
  }, [storageKey]);

  const saveNotes = (updated: ExpertNote[]) => {
    setNotes(updated);
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch (err) {
      console.warn('Could not persist notes to local storage', err);
    }
  };

  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTag, setNewTag] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<'RELIABILITY' | 'SAFETY_TIP' | 'TOOLING_HACK'>('RELIABILITY');

  const handleUpvote = (id: string) => {
    const updated = notes.map((n) => (n.id === id ? { ...n, upvotes: n.upvotes + 1 } : n));
    saveNotes(updated);
    toast.info('Insight Endorsed', 'Thank you for endorsing peer reliability expertise.');
  };

  const handleSubmitNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) {
      toast.error('Validation Error', 'Title and field knowledge content are required.');
      return;
    }

    const note: ExpertNote = {
      id: `exp-${Date.now()}`,
      title: newTitle.trim(),
      author: user?.fullName || 'Senior Engineer',
      role: user?.email || 'Plant Specialist',
      assetTag: newTag.trim().toUpperCase() || 'PLANT_WIDE',
      category: newCategory,
      content: newContent.trim(),
      date: new Date().toISOString().split('T')[0],
      upvotes: 1,
    };

    saveNotes([note, ...notes]);
    setIsSubmitOpen(false);
    setNewTitle('');
    setNewTag('');
    setNewContent('');
    toast.success('Field Insight Saved', 'Tribal knowledge note published to workspace.');
  };

  const filtered = notes.filter(
    (n) =>
      n.title.toLowerCase().includes(search.toLowerCase()) ||
      n.content.toLowerCase().includes(search.toLowerCase()) ||
      n.assetTag.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 min-h-0 min-w-0 w-full h-full p-5 md:p-6 overflow-y-auto bg-[#F5F6F7] space-y-6">
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
            Frontline field insights, lessons learned & undocumented machine behaviors for {organization?.name || 'Your Company'}
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
      {notes.length > 0 && (
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
      )}

      {/* Grid of Expert Knowledge Cards or Zero State */}
      {notes.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-[#E2E8F0] max-w-lg mx-auto shadow-sm space-y-4">
          <div className="w-12 h-12 rounded-full bg-blue-50 text-[#2563EB] flex items-center justify-center mx-auto">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">No Expert Knowledge Notes Recorded Yet</h3>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Capture frontline tribal wisdom, unofficial maintenance tricks, non-standard tooling tips, and undocumented operational behaviors across your plant machinery.
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsSubmitOpen(true)}
            leftIcon={<Plus className="w-3.5 h-3.5" />}
            className="bg-[#151C24] text-white hover:bg-black font-semibold rounded-lg shadow-sm"
          >
            Submit First Field Note
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-8 text-center bg-white rounded-xl border border-[#E2E8F0]">
          <p className="text-xs font-mono text-gray-500">No notes match your search query '{search}'</p>
        </div>
      ) : (
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
      )}

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
