import { useCallback, useEffect, useRef, useState } from "react";

type Category = { key: string; label: string; description: string | null };

type TicketRow = {
  id: string;
  number: number;
  subject: string;
  status: string;
  priority: string;
  categoryLabel: string;
  unread: boolean;
  updatedAt: string;
};

type TicketMsg = {
  id: string;
  sender: string;
  senderName: string;
  body: string;
  fileId: string | null;
  fileName: string | null;
  fileMime: string | null;
  createdAt: string;
};

type TicketDetail = {
  id: string;
  number: number;
  subject: string;
  status: string;
  priority: string;
  categoryLabel: string;
  messages: TicketMsg[];
};

const MAX_UPLOAD = 50 * 1024 * 1024;

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  open: "Open",
  assigned: "In progress",
  waiting_player: "Waiting for you",
  waiting_staff: "Waiting for staff",
  escalated: "Escalated",
  resolved: "Resolved",
  closed: "Closed",
};

function fileToB64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result);
      const comma = s.indexOf(",");
      resolve(comma >= 0 ? s.slice(comma + 1) : s);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function AttImage({ id }: { id: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void window.isleOverlay.apiGetFile(`/api/overlay/tickets/file/${id}`).then((r) => {
      if (alive && r.dataUrl) setSrc(r.dataUrl);
    });
    return () => {
      alive = false;
    };
  }, [id]);
  if (!src) return <div className="admMuted">Loading image…</div>;
  return <img className="admImg" src={src} alt="attachment" />;
}

export function TicketsSection({ authed }: { authed: boolean }) {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pollBump, setPollBump] = useState(0);

  const loadList = useCallback(async () => {
    const r = await window.isleOverlay.apiGet<{ tickets?: TicketRow[] }>(
      "/api/overlay/tickets",
    );
    if (!r.error) setTickets(r.tickets ?? []);
  }, []);

  useEffect(() => {
    if (!authed) return;
    void loadList();
    void window.isleOverlay
      .apiGet<{ categories?: Category[] }>("/api/overlay/tickets/categories")
      .then((r) => {
        if (!r.error) setCategories(r.categories ?? []);
      });
    const iv = setInterval(loadList, 15000);
    return () => clearInterval(iv);
  }, [authed, loadList, pollBump]);

  useEffect(() => {
    if (!authed) return;
    const off = window.isleOverlay.onTicket(() => setPollBump((b) => b + 1));
    return off;
  }, [authed]);

  useEffect(() => {
    if (!authed || !openId) {
      setDetail(null);
      return;
    }
    let alive = true;
    const tick = async () => {
      const r = await window.isleOverlay.apiGet<{ ticket?: TicketDetail }>(
        `/api/overlay/tickets/${openId}`,
      );
      if (alive && !r.error && r.ticket) setDetail(r.ticket);
    };
    void tick();
    void window.isleOverlay.apiPost(`/api/overlay/tickets/${openId}/read`, {});
    const iv = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [authed, openId, pollBump]);

  if (!authed) return null;

  if (openId && detail) {
    return (
      <TicketThread
        detail={detail}
        busy={busy}
        setBusy={setBusy}
        err={err}
        setErr={setErr}
        onBack={() => {
          setOpenId(null);
          setPollBump((b) => b + 1);
        }}
        onChanged={() => setPollBump((b) => b + 1)}
      />
    );
  }

  return (
    <>
      <div className="admCard">
        <div className="admHead">
          Your tickets <span className="sectionCount">{tickets.length}</span>
        </div>
        {tickets.length === 0 ? (
          <div className="admMuted">No tickets yet.</div>
        ) : (
          tickets.map((t) => (
            <div key={t.id} className="admRow">
              <span>
                {t.unread ? <span className="ticketDot" /> : null}
                <span className="admMuted">#{t.number}</span> {t.subject}{" "}
                <span className="admMuted">
                  · {t.categoryLabel} · {STATUS_LABEL[t.status] ?? t.status}
                  {t.priority === "urgent" ? " · URGENT" : ""}
                </span>
              </span>
              <button
                className="admChip interactive-region"
                onClick={() => setOpenId(t.id)}
              >
                Open
              </button>
            </div>
          ))
        )}
      </div>

      {creating ? (
        <CreateTicket
          categories={categories}
          busy={busy}
          setBusy={setBusy}
          err={err}
          setErr={setErr}
          onDone={(id) => {
            setCreating(false);
            setPollBump((b) => b + 1);
            if (id) setOpenId(id);
          }}
        />
      ) : (
        <div className="admCard">
          <button
            className="admChip primary interactive-region"
            onClick={() => setCreating(true)}
          >
            Open a new ticket
          </button>
          <div className="admMuted">
            The staff team answers here and on the website, both stay in sync.
          </div>
        </div>
      )}
      {err && !creating ? <div className="gMsg err">{err}</div> : null}
    </>
  );
}

function CreateTicket({
  categories,
  busy,
  setBusy,
  err,
  setErr,
  onDone,
}: {
  categories: Category[];
  busy: boolean;
  setBusy: (v: boolean) => void;
  err: string | null;
  setErr: (v: string | null) => void;
  onDone: (openId: string | null) => void;
}) {
  const [categoryKey, setCategoryKey] = useState(categories[0]?.key ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const selected = categories.find((c) => c.key === categoryKey);

  async function submit() {
    setErr(null);
    setBusy(true);
    try {
      const r = (await window.isleOverlay.apiPost("/api/overlay/tickets", {
        categoryKey,
        subject,
        body,
      })) as { error?: string; id?: string };
      if (r.error) setErr(r.error);
      else onDone(r.id ?? null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admCard">
      <div className="admHead">New ticket</div>
      <div className="admStatusRow">
        {categories.map((c) => (
          <button
            key={c.key}
            className={`admChip interactive-region ${c.key === categoryKey ? "on" : ""}`}
            onClick={() => setCategoryKey(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>
      {selected?.description ? (
        <div className="admMuted">{selected.description}</div>
      ) : null}
      <input
        className="gNameInput interactive-region"
        value={subject}
        maxLength={120}
        placeholder="Subject"
        onChange={(e) => setSubject(e.target.value)}
      />
      <textarea
        className="gNameInput interactive-region ticketArea"
        value={body}
        maxLength={4000}
        rows={4}
        placeholder="Describe your issue…"
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="admInputRow">
        <button
          className="admChip primary interactive-region"
          disabled={busy || !subject.trim() || !body.trim() || !categoryKey}
          onClick={() => void submit()}
        >
          Submit
        </button>
        <button
          className="admChip interactive-region"
          disabled={busy}
          onClick={() => onDone(null)}
        >
          Cancel
        </button>
      </div>
      {err ? <div className="gMsg err">{err}</div> : null}
    </div>
  );
}

function TicketThread({
  detail,
  busy,
  setBusy,
  err,
  setErr,
  onBack,
  onChanged,
}: {
  detail: TicketDetail;
  busy: boolean;
  setBusy: (v: boolean) => void;
  err: string | null;
  setErr: (v: string | null) => void;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const closed = detail.status === "closed";

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [detail.messages.length]);

  async function send() {
    const text = input.trim();
    if (!text) return;
    setErr(null);
    setBusy(true);
    try {
      const r = (await window.isleOverlay.apiPost(`/api/overlay/tickets/${detail.id}`, {
        body: text,
      })) as { error?: string };
      if (r.error) setErr(r.error);
      else {
        setInput("");
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  }

  async function close() {
    setBusy(true);
    try {
      await window.isleOverlay.apiPost(`/api/overlay/tickets/${detail.id}`, {
        action: "close",
      });
      onChanged();
      onBack();
    } finally {
      setBusy(false);
    }
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > MAX_UPLOAD) {
      setErr("File too large (max 50 MB).");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const b64 = await fileToB64(f);
      const up = (await window.isleOverlay.apiPost("/api/overlay/tickets/upload", {
        ticketId: detail.id,
        name: f.name,
        mime: f.type || "application/octet-stream",
        dataB64: b64,
      })) as { error?: string; fileId?: string };
      if (up.error || !up.fileId) {
        setErr(up.error ?? "Upload failed.");
        return;
      }
      const r = (await window.isleOverlay.apiPost(`/api/overlay/tickets/${detail.id}`, {
        body: "",
        fileId: up.fileId,
      })) as { error?: string };
      if (r.error) setErr(r.error);
      else onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admCard">
      <div className="admHead">
        <button className="admChip interactive-region" onClick={onBack}>
          ‹ Back
        </button>{" "}
        #{detail.number} {detail.subject}{" "}
        <span className="admMuted">
          · {STATUS_LABEL[detail.status] ?? detail.status}
        </span>
      </div>
      <div className="admChat">
        <div className="admLog interactive-region">
          {detail.messages.map((m) => (
            <div key={m.id} className={`admMsg ${m.sender === "player" ? "usr" : "adm"}`}>
              <span className="admMsgName">
                {m.sender === "player" ? "You" : m.senderName}
              </span>
              {m.body ? <span className="admMsgBody">{m.body}</span> : null}
              {m.fileId ? (
                (m.fileMime ?? "").startsWith("image/") ? (
                  <AttImage id={m.fileId} />
                ) : (
                  <div className="admFile">{m.fileName ?? "Attachment"}</div>
                )
              ) : m.fileName ? (
                <div className="admMuted">{m.fileName} (expired)</div>
              ) : null}
            </div>
          ))}
          <div ref={endRef} />
        </div>
        {closed ? (
          <div className="admMuted">Ticket closed.</div>
        ) : (
          <div className="admInputRow">
            <input
              className="gNameInput interactive-region"
              value={input}
              maxLength={4000}
              placeholder="Write a reply…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void send();
              }}
            />
            <button
              className="admChip interactive-region"
              disabled={busy}
              onClick={() => void send()}
            >
              Send
            </button>
            <button
              className="admChip interactive-region"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              title="Attach a screenshot or file"
            >
              Attach
            </button>
            <button
              className="admChip interactive-region"
              disabled={busy}
              onClick={() => void close()}
            >
              Close ticket
            </button>
            <input
              ref={fileRef}
              type="file"
              style={{ display: "none" }}
              onChange={(e) => void onPick(e)}
            />
          </div>
        )}
      </div>
      {err ? <div className="gMsg err">{err}</div> : null}
    </div>
  );
}
