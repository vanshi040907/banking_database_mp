import { Art } from './Art.jsx';
import { Badge, Card, PageHeader } from './ui.jsx';

// Placeholder for screens whose backend routes do not exist yet. It keeps the navigation and design
// complete, and each page is replaced by the real screen once its endpoint lands.
export default function ComingSoon({ title, subtitle, art = 'horizon', features = [], note }) {
  return (
    <div className="soft-in">
      <PageHeader title={title} subtitle={subtitle} actions={<Badge tone="violet">Coming soon</Badge>} />
      <Card className="relative overflow-hidden">
        <Art name={art} fade="l r t b" fadeSize={18} className="mx-auto h-[170px] w-full max-w-[640px]" imgClassName="object-contain" />
        <div className="px-8 pb-9 pt-2 text-center">
          <h2 className="text-[26px]">Still being written.</h2>
          <p className="mx-auto mt-2 max-w-[520px] text-ink-400">{note ?? 'This part of Inkwell is on its way. Everything else here already works.'}</p>
          {features.length > 0 && (
            <ul className="mx-auto mt-6 grid max-w-[560px] gap-2.5 text-left sm:grid-cols-2">
              {features.map((f) => (
                <li key={f} className="flex items-start gap-2.5 rounded-lg border border-line px-3.5 py-2.5 text-[14px] text-ink-700">
                  <span className="mt-0.5 text-violet-500" aria-hidden="true">✦</span>{f}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
