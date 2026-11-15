import { Link } from 'react-router-dom';
import { useAuth } from '@shared/auth.jsx';
import { Card, KV, SectionTitle } from '@shared/ui.jsx';
import { greeting, titleCase } from '@shared/format.js';

import {
  can,
  canOpenPage,
  pageFeatures
} from '../access.js';

import { SOON } from '../soon.js';

export default function Overview() {
  const { user } = useAuth();

  const cards = [
    ['ISSUE_CARD', 'Issue demo cards'],
    ['UPDATE_CARD_LIMIT', 'Update card limits'],
    ['UNBLOCK_CARD', 'Review unblock requests']
  ]
    .filter(([permission]) => can(user, permission))
    .map(([, text]) => text);

  const pages = [
    {
      key: 'cards',
      label: 'Cards',
      path: '/cards',
      features: cards
    },

    ...Object.entries(SOON).map(([key, page]) => ({
      key,
      label: page.label,
      path: page.path,
      features: pageFeatures(user, key)
    }))
  ].filter(page => canOpenPage(user, page.key));

  return (
    <div className="soft-in">
      <p className="mb-2 text-[13px] font-medium uppercase tracking-[0.12em] text-violet-600">
        {titleCase(user.role)} · Employee {user.id}
      </p>

      <h1 className="mb-2 text-[38px] leading-tight">
        {greeting()}, {user.name}.
      </h1>

      <p className="mb-9 text-ink-400">
        {user.scope === 'ALL_BRANCHES'
          ? 'Your workspace covers all branches.'
          : `Your workspace covers ${user.branch.name}.`}
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-4">
          <SectionTitle>Your workspaces</SectionTitle>

          {pages.map(page => (
            <Link
              key={page.key}
              to={page.path}
              className="block"
            >
              <Card className="p-5 transition hover:border-ink-200 hover:bg-violet-50">
                <h2 className="text-[22px]">{page.label}</h2>

                <ul className="mt-2 space-y-1 text-sm text-ink-400">
                  {page.features.map(feature => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
              </Card>
            </Link>
          ))}
        </section>

        <Card className="h-fit p-5">
          <SectionTitle>Your access</SectionTitle>

          <dl>
            <KV k="Employee" v={user.id} />
            <KV k="Role" v={titleCase(user.role)} />
            <KV k="Branch" v={user.branch.name} />

            <KV
              k="Scope"
              v={
                user.scope === 'ALL_BRANCHES'
                  ? 'All branches'
                  : 'Own branch'
              }
            />
          </dl>

          <Link
            to="/security"
            className="mt-4 inline-block text-sm text-violet-700 underline underline-offset-4"
          >
            Manage your password
          </Link>
        </Card>
      </div>
    </div>
  );
}