import Link from "next/link";
import { TBody, THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { formatDateWithWeekday, formatTimeRange } from "@/lib/format";
import type { MeetingSummary } from "@/lib/types";
import { t } from "@/messages";
import { ConflictBadge, RoleBadge, StatusBadge } from "./meeting-badges";

interface Props {
  meetings: MeetingSummary[];
  /** Meeting ids that have a PENDING conflict (from GET /conflicts/mine). */
  conflictIds: ReadonlySet<string>;
  /** Week / month: also show the date. */
  showDate?: boolean;
}

function organizerText(m: MeetingSummary) {
  const designation = m.organizer.designation?.nameBn;
  return designation ? `${m.organizer.nameBn}, ${designation}` : m.organizer.nameBn;
}

/** Time-ordered meeting list: a table on wide screens, cards on phones. */
export function MeetingList({ meetings, conflictIds, showDate = false }: Props) {
  const sorted = [...meetings].sort((a, b) => a.startAt.localeCompare(b.startAt));

  return (
    <>
      {/* Phones */}
      <ul className="divide-y divide-slate-100 md:hidden" data-testid="meeting-list">
        {sorted.map((m) => (
          <li key={m.id} className="px-4 py-3">
            {showDate && (
              <p className="text-xs text-slate-500">{formatDateWithWeekday(m.startAt)}</p>
            )}
            <p className="text-sm font-medium text-brand-800">
              {formatTimeRange(m.startAt, m.endAt)}
            </p>
            <Link
              href={`/meetings/${m.id}`}
              className="mt-0.5 block font-semibold text-slate-900 hover:underline"
            >
              {m.title}
            </Link>
            <p className="mt-0.5 text-sm text-slate-600">
              {m.room ?? t.meeting.noRoom} · {organizerText(m)}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <StatusBadge status={m.status} />
              <RoleBadge role={m.myRole} />
              {conflictIds.has(m.id) && <ConflictBadge />}
            </div>
          </li>
        ))}
      </ul>

      {/* Tablets and desktops */}
      <div className="hidden md:block">
        <Table>
          <THead>
            <tr>
              <Th className="w-56">{t.meeting.time}</Th>
              <Th>{t.meeting.title}</Th>
              <Th>{t.meeting.room}</Th>
              <Th>{t.meeting.organizer}</Th>
              <Th>{t.meeting.role}</Th>
              <Th>{t.meeting.statusLabel}</Th>
            </tr>
          </THead>
          <TBody>
            {sorted.map((m) => (
              <Tr key={m.id} className={m.status === "CANCELLED" ? "text-slate-500" : undefined}>
                <Td className="whitespace-nowrap">
                  {showDate && (
                    <span className="block text-xs text-slate-500">
                      {formatDateWithWeekday(m.startAt)}
                    </span>
                  )}
                  <span className="font-medium text-brand-800">
                    {formatTimeRange(m.startAt, m.endAt)}
                  </span>
                </Td>
                <Td>
                  <Link
                    href={`/meetings/${m.id}`}
                    className="font-semibold text-slate-900 hover:underline"
                  >
                    {m.title}
                  </Link>
                  {conflictIds.has(m.id) && (
                    <span className="ml-2 align-middle">
                      <ConflictBadge />
                    </span>
                  )}
                </Td>
                <Td>{m.room ?? <span className="text-slate-400">{t.meeting.noRoom}</span>}</Td>
                <Td>{organizerText(m)}</Td>
                <Td>
                  <RoleBadge role={m.myRole} />
                </Td>
                <Td>
                  <StatusBadge status={m.status} />
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </div>
    </>
  );
}
