"use client";

import { useState } from "react";
import { format, parseISO, subDays } from "date-fns";
import {
  CheckCircle2,
  Cloud,
  Download,
  FolderTree,
  HardDrive,
  Lock,
  PlayCircle,
  RotateCcw,
  Server,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogDescription,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { TODAY } from "@/lib/dashboard-data";
import { clients } from "@/lib/mock-data/clients";
import { cn } from "@/lib/utils";

interface Destination {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  enabled: boolean;
  detail?: string;
}

const DEFAULT_DESTINATIONS: Destination[] = [
  {
    id: "cloud",
    label: "Cloud (Supabase managed)",
    description: "Encrypted at rest, 30-day retention, ca-central-1.",
    icon: Cloud,
    enabled: true,
  },
  {
    id: "local",
    label: "Local Mac folder",
    description: "Backed up to disk via the Nexvelon Sync agent.",
    icon: FolderTree,
    enabled: true,
    detail: "/Users/marcus/Nexvelon/Backups",
  },
  {
    id: "external",
    label: "External drive / NAS",
    description: "Synology DS920+ on the operations LAN.",
    icon: HardDrive,
    enabled: false,
    detail: "smb://NX-NAS-01/backups",
  },
  {
    id: "s3",
    label: "AWS S3 bucket",
    description: "Cross-region replication enabled.",
    icon: Server,
    enabled: false,
    detail: "s3://nexvelon-prod-backups · ca-central-1",
  },
];

interface HistoryRow {
  id: string;
  date: string;
  type: "Full" | "Incremental";
  size: string;
  destination: string;
  status: "Success" | "Warning" | "Failed";
}

function buildHistory(): HistoryRow[] {
  const out: HistoryRow[] = [];
  for (let i = 0; i < 30; i++) {
    const d = subDays(TODAY, i);
    const isFull = i % 7 === 0;
    out.push({
      id: `bk-${i}`,
      date: d.toISOString(),
      type: isFull ? "Full" : "Incremental",
      size: isFull ? `${(247 + i * 0.4).toFixed(0)} MB` : `${(38 + (i * 7) % 28).toFixed(0)} MB`,
      destination: i % 5 === 0 ? "Cloud + Local + S3" : "Cloud + Local",
      status: i === 11 ? "Warning" : "Success",
    });
  }
  return out;
}

export function BackupsData() {
  const [destinations, setDestinations] = useState(DEFAULT_DESTINATIONS);
  const [path, setPath] = useState("/Users/marcus/Nexvelon/Backups");
  const [s3Bucket, setS3Bucket] = useState("nexvelon-prod-backups");
  const [s3Region, setS3Region] = useState("ca-central-1");
  const [dailyTime, setDailyTime] = useState("02:00");
  const [weeklyDay, setWeeklyDay] = useState("Sunday");
  const [realtime, setRealtime] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const history = buildHistory();

  const toggleDest = (id: string) => {
    setDestinations((prev) =>
      prev.map((d) => (d.id === id ? { ...d, enabled: !d.enabled } : d))
    );
  };

  const runBackup = () => {
    setProgress(0);
    const start = Date.now();
    const total = 3000;
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(100, Math.round((elapsed / total) * 100));
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          setProgress(null);
          toast.success("Backup complete", {
            description: "247 MB · saved to all destinations.",
          });
        }, 250);
      }
    }, 60);
  };

  const exportClient = (clientName: string) =>
    toast.success(`Generating ${clientName}.zip`, {
      description:
        "Includes all quotes, projects, invoices, documents, photos. Will download in 30 seconds.",
    });

  return (
    <div className="space-y-8">
      <Section title="Backup destinations" description="3-2-1 backup rule — enable as many destinations as you need.">
        <ul className="space-y-2">
          {destinations.map((d) => {
            const Icon = d.icon;
            return (
              <li
                key={d.id}
                className={cn(
                  "bg-card flex items-start gap-3 rounded-lg border p-4 shadow-sm transition-colors",
                  d.enabled
                    ? "border-brand-gold/40 bg-brand-gold/5"
                    : "border-[var(--border)]"
                )}
              >
                <button
                  type="button"
                  onClick={() => toggleDest(d.id)}
                  className={cn(
                    "mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors",
                    d.enabled ? "bg-brand-gold" : "bg-muted"
                  )}
                  aria-pressed={d.enabled}
                >
                  <span
                    className={cn(
                      "block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                      d.enabled ? "translate-x-4" : "translate-x-0"
                    )}
                  />
                </button>
                <Icon className="text-brand-gold mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-brand-charcoal text-sm font-semibold">{d.label}</p>
                  <p className="text-muted-foreground text-[11px]">{d.description}</p>
                  {d.id === "local" && d.enabled && (
                    <div className="mt-2 space-y-2">
                      <Input
                        value={path}
                        onChange={(e) => setPath(e.target.value)}
                        className="font-mono text-xs"
                      />
                      <FolderTreeMock path={path} />
                    </div>
                  )}
                  {d.id === "s3" && d.enabled && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Input
                        value={s3Bucket}
                        onChange={(e) => setS3Bucket(e.target.value)}
                        placeholder="bucket"
                        className="font-mono text-xs"
                      />
                      <Input
                        value={s3Region}
                        onChange={(e) => setS3Region(e.target.value)}
                        placeholder="region"
                        className="font-mono text-xs"
                      />
                    </div>
                  )}
                  {d.id === "external" && d.enabled && d.detail && (
                    <p className="text-muted-foreground mt-1 font-mono text-[11px]">
                      {d.detail}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Schedule" description="Backups run on the schedule below. Real-time replication mirrors changes within 60 seconds.">
        <Card className="bg-card grid grid-cols-1 gap-4 p-4 shadow-sm md:grid-cols-3">
          <div>
            <Label className="text-muted-foreground text-[11px]">Daily backup at</Label>
            <Input type="time" value={dailyTime} onChange={(e) => setDailyTime(e.target.value)} />
          </div>
          <div>
            <Label className="text-muted-foreground text-[11px]">Weekly full</Label>
            <Input value={weeklyDay} onChange={(e) => setWeeklyDay(e.target.value)} />
          </div>
          <div>
            <Label className="text-muted-foreground text-[11px]">Real-time replication</Label>
            <button
              type="button"
              onClick={() => setRealtime((r) => !r)}
              className={cn(
                "mt-1 inline-flex h-5 w-9 items-center rounded-full p-0.5 transition-colors",
                realtime ? "bg-brand-gold" : "bg-muted"
              )}
            >
              <span
                className={cn(
                  "block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                  realtime ? "translate-x-4" : "translate-x-0"
                )}
              />
            </button>
            <p className="text-muted-foreground text-[10px]">Monthly archive on the 1st</p>
          </div>
        </Card>
      </Section>

      <Section title="Manual actions">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={runBackup} disabled={progress !== null}>
            <PlayCircle className="mr-1.5 h-3.5 w-3.5" />
            Backup Now
          </Button>
          <Button
            variant="outline"
            onClick={() => setHistoryOpen(true)}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Restore from Backup
          </Button>
          {progress !== null && (
            <div className="flex flex-1 items-center gap-3 text-xs">
              <div className="bg-muted h-2 max-w-xs flex-1 overflow-hidden rounded-full">
                <div
                  className="bg-brand-gold h-full"
                  style={{ width: `${progress}%`, transition: "width 0.06s linear" }}
                />
              </div>
              <span className="text-brand-charcoal tabular-nums">{progress}%</span>
            </div>
          )}
        </div>
      </Section>

      <Section title="Backup history">
        <Card className="bg-card overflow-hidden p-0 shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] uppercase">Date</TableHead>
                <TableHead className="text-[10px] uppercase">Type</TableHead>
                <TableHead className="text-right text-[10px] uppercase">Size</TableHead>
                <TableHead className="text-[10px] uppercase">Destination</TableHead>
                <TableHead className="text-[10px] uppercase">Status</TableHead>
                <TableHead className="text-right text-[10px] uppercase">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.slice(0, 10).map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="text-muted-foreground text-xs tabular-nums">
                    {format(parseISO(h.date), "MMM d, yyyy · HH:mm")}
                  </TableCell>
                  <TableCell className="text-xs">{h.type}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{h.size}</TableCell>
                  <TableCell className="text-muted-foreground text-[11px]">
                    {h.destination}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                        h.status === "Success"
                          ? "bg-emerald-50 text-emerald-700"
                          : h.status === "Warning"
                            ? "bg-amber-50 text-amber-800"
                            : "bg-red-50 text-red-700"
                      )}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      {h.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() =>
                        toast(`Restoring backup from ${format(parseISO(h.date), "MMM d, HH:mm")}`)
                      }
                    >
                      Restore
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </Section>

      <Section title="Per-client export" description="One-click client folder export — useful for legal hold or off-boarding.">
        <Card className="bg-card overflow-hidden p-0 shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] uppercase">Client</TableHead>
                <TableHead className="text-[10px] uppercase">Type</TableHead>
                <TableHead className="text-right text-[10px] uppercase">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.slice(0, 8).map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="text-brand-charcoal text-xs font-medium">
                    {c.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">{c.type}</TableCell>
                  <TableCell className="text-right">
                    <Button size="xs" variant="outline" onClick={() => exportClient(c.name)}>
                      <Download className="mr-1 h-3 w-3" />
                      Export Folder
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </Section>

      <div className="bg-muted/40 flex items-start gap-3 rounded-md border border-[var(--border)] px-4 py-3 text-xs leading-relaxed">
        <Lock className="text-brand-gold mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p className="text-brand-charcoal/80">
          Backups are encrypted with <span className="font-semibold">AES-256</span>. Local Mac
          backups require the <span className="font-semibold">Nexvelon Sync</span> agent (download
          below). Cloud backups are stored in the Canadian region (<span className="font-mono">ca-central-1</span>) for data residency.
        </p>
      </div>

      <Button
        variant="outline"
        onClick={() =>
          toast.success("Nexvelon Sync for Mac (1.4.2) downloaded", {
            description: "26 MB · ~/Downloads/NexvelonSync-1.4.2.dmg",
          })
        }
      >
        <Download className="mr-1.5 h-3.5 w-3.5" />
        Download Nexvelon Sync for Mac
      </Button>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-serif">Restore from backup</DialogTitle>
            <DialogDescription>
              Pick a snapshot to restore. Restores are atomic and reversible — the
              current state is also snapshotted before restore begins.
            </DialogDescription>
          </DialogHeader>
          <Card className="bg-card overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] uppercase">Date</TableHead>
                  <TableHead className="text-[10px] uppercase">Type</TableHead>
                  <TableHead className="text-[10px] uppercase">Size</TableHead>
                  <TableHead className="text-[10px] uppercase">Destination</TableHead>
                  <TableHead className="text-right text-[10px] uppercase">Restore</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="text-xs tabular-nums">
                      {format(parseISO(h.date), "MMM d, yyyy · HH:mm")}
                    </TableCell>
                    <TableCell className="text-xs">{h.type}</TableCell>
                    <TableCell className="text-xs tabular-nums">{h.size}</TableCell>
                    <TableCell className="text-muted-foreground text-[11px]">
                      {h.destination}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="xs"
                        onClick={() =>
                          toast.success(
                            `Restore queued from ${format(parseISO(h.date), "MMM d, HH:mm")}`
                          )
                        }
                      >
                        Restore this snapshot
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setHistoryOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FolderTreeMock({ path }: { path: string }) {
  const folders = [
    { name: "Quotes", count: "180 files" },
    { name: "Projects", count: "62 folders · 4.1 GB" },
    { name: "Invoices", count: "240 files" },
    { name: "Documents", count: "1,420 files" },
    { name: "Photos", count: "8,400 files · 24 GB" },
  ];
  return (
    <div className="bg-muted/40 rounded-md border border-[var(--border)] p-2 font-mono text-[10px]">
      <p className="text-brand-charcoal/80">{path}</p>
      <p className="text-brand-charcoal/60 ml-2">└── Clients/</p>
      <p className="text-brand-charcoal/60 ml-6">├── Meridian Tower Holdings/</p>
      {folders.map((f, i) => (
        <p key={f.name} className="text-muted-foreground ml-10">
          {i === folders.length - 1 ? "└──" : "├──"} {f.name}/{" "}
          <span className="text-brand-charcoal/40">{f.count}</span>
        </p>
      ))}
      <p className="text-brand-charcoal/60 ml-6">├── Northbridge Logistics/</p>
      <p className="text-brand-charcoal/60 ml-6">├── Royal Oak Estate/</p>
      <p className="text-brand-charcoal/60 ml-6">└── ... 17 more clients</p>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-brand-navy mb-1 font-serif text-lg">{title}</h3>
      {description && (
        <p className="text-muted-foreground mb-3 text-xs">{description}</p>
      )}
      {children}
    </section>
  );
}
