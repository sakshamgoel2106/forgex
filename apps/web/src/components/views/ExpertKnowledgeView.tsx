import React, { useState } from 'react';
import {
  GraduationCap,
  Plus,
  Search,
  User,
  ThumbsUp,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';

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

  return (
    <div className="flex-1 p-6 overflow-y-auto bg-graphite-950 space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-graphite-800">
        <div>
          <div className="flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-amber-500" />
            <h2 className="text-base font-bold font-mono text-graphite-100 uppercase tracking-wide">
              Expert Knowledge & Tribal Wisdom Repository
            </h2>
          </div>
          <p className="text-xs text-graphite-400 mt-0.5 font-mono">
            Frontline field insights, lessons learned & undocumented machine behaviors
          </p>
        </div>

        <Button variant="primary" size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />}>
          Submit Field Note
        </Button>
      </div>

      {/* Search Bar */}
      <div className="max-w-md relative">
        <Search className="w-3.5 h-3.5 text-graphite-500 absolute left-3 top-2.5" />
        <input
          type="text"
          placeholder="Search expert notes by equipment or topic..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-1.5 bg-graphite-900 border border-graphite-800 rounded text-xs font-mono text-graphite-200 placeholder-graphite-500 focus:outline-none focus:border-amber-500"
        />
      </div>

      {/* Grid of Expert Knowledge Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SAMPLE_NOTES.map((note) => (
          <Card key={note.id} variant="elevated">
            <CardHeader>
              <div>
                <span className="text-[10px] font-mono text-amber-500 uppercase">
                  {note.category}
                </span>
                <CardTitle className="text-xs mt-0.5 font-sans normal-case font-bold">
                  {note.title}
                </CardTitle>
              </div>
              <span className="text-[10px] font-mono text-cyan-400 bg-graphite-950 px-2 py-0.5 rounded border border-graphite-800">
                {note.assetTag}
              </span>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-graphite-300 leading-relaxed font-sans">{note.content}</p>

              <div className="pt-2 border-t border-graphite-800/80 flex items-center justify-between text-[11px] font-mono text-graphite-400">
                <div className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-graphite-500" />
                  <span>{note.author}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span>{note.date}</span>
                  <span className="flex items-center gap-1 text-amber-400">
                    <ThumbsUp className="w-3 h-3" /> {note.upvotes}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
