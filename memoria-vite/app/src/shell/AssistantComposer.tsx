import {
  ArrowUp,
  ChevronDown,
  History,
  Plus,
  RotateCcw,
  Square,
  Trash2,
  Wrench,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  DEFAULT_WORKBENCH_MODEL,
  FALLBACK_WORKBENCH_MODEL_OPTIONS,
  normalizeWorkbenchModel
} from "@/lib/workbench-models";
import { useCodexModels } from "@/lib/use-codex-models";
import {
  createAssistantThread,
  deleteAssistantThread,
  loadAssistantStatus,
  loadAssistantThread,
  loadAssistantThreads,
  stopAssistantTurn,
  streamAssistantTurn
} from "../api";
import type { AssistantEvent, AssistantStatus, AssistantThread } from "../types";

type ComposerMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};
type ToolActivity = {
  detail: string;
  id: string;
  label: string;
  state: "completed" | "failed" | "started";
};
type TranscriptItem =
  | {
      message: ComposerMessage;
      type: "message";
    }
  | {
      activity: ToolActivity;
      type: "tool";
    };
type AssistantModelForm = {
  effort: string;
  family: string;
  number: string;
};

const ASSISTANT_MODEL_FAMILIES = ["standard", "nano", "instant"];
const ASSISTANT_MODEL_EFFORTS = ["auto", "low", "medium", "high"];

export function AssistantComposer({ onImportFile }: { onImportFile: (file: File) => Promise<boolean> }) {
  const [activeThread, setActiveThread] = useState<AssistantThread | null>(null);
  const [assistantModel, setAssistantModel] = useState(DEFAULT_WORKBENCH_MODEL);
  const [assistantModelDialogOpen, setAssistantModelDialogOpen] = useState(false);
  const [assistantModelDraft, setAssistantModelDraft] = useState<AssistantModelForm>(() => modelFormFromValue(DEFAULT_WORKBENCH_MODEL));
  const [events, setEvents] = useState<AssistantEvent[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [threads, setThreads] = useState<AssistantThread[]>([]);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const { data: modelSnapshot } = useCodexModels();

  useEffect(() => {
    void loadInitialState();
  }, []);

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      behavior: "smooth",
      top: transcriptRef.current.scrollHeight
    });
  }, [events, historyOpen, notice, transcriptOpen]);

  const transcriptItems = useMemo(() => reduceAssistantEventsToTranscript(events), [events]);
  const modelOptions = modelSnapshot?.models.length ? modelSnapshot.models : FALLBACK_WORKBENCH_MODEL_OPTIONS;
  const selectedAssistantModel = assistantModel.trim() || normalizeWorkbenchModel(assistantModel, modelOptions);
  const hasOpenTurn = events.some((event) => event.type === "turn.started") && !events.some((event) => event.type === "turn.completed" || event.type === "turn.failed");

  function openAssistantModelDialog() {
    setAssistantModelDraft(modelFormFromValue(selectedAssistantModel));
    setAssistantModelDialogOpen(true);
  }

  function saveAssistantModelDraft() {
    const nextModel = modelValueFromForm(assistantModelDraft);

    setAssistantModel(nextModel);
    setAssistantModelDialogOpen(false);
  }

  async function loadInitialState() {
    try {
      const [nextStatus, threadList] = await Promise.all([loadAssistantStatus(), loadAssistantThreads()]);
      setStatus(nextStatus);
      setThreads(threadList.threads);

      const firstThread = threadList.threads[0] ?? null;

      if (firstThread) {
        await selectThread(firstThread.id, { openTranscript: false });
      }
    } catch (error) {
      setNotice(errorMessage(error, "Assistant is not ready."));
    }
  }

  async function refreshThreads() {
    setIsHistoryLoading(true);

    try {
      const threadList = await loadAssistantThreads();
      setThreads(threadList.threads);
    } catch (error) {
      setNotice(errorMessage(error, "Saved chats could not be loaded."));
    } finally {
      setIsHistoryLoading(false);
    }
  }

  async function selectThread(threadId: string, options: { openTranscript?: boolean } = {}) {
    try {
      const thread = await loadAssistantThread(threadId);
      setActiveThread(thread);
      setEvents(thread.events ?? []);
      setHistoryOpen(false);
      setTranscriptOpen(Boolean(options.openTranscript));
      setNotice(null);
    } catch (error) {
      setNotice(errorMessage(error, "Chat could not be opened."));
    }
  }

  async function resetThread() {
    setNotice(null);

    try {
      const thread = await createAssistantThread({ title: "New chat" });
      setActiveThread(thread);
      setEvents([]);
      setThreads((current) => [thread, ...current]);
      setTranscriptOpen(true);
    } catch (error) {
      setNotice(errorMessage(error, "New chat could not be created."));
    }
  }

  async function removeThread(threadId: string) {
    try {
      await deleteAssistantThread(threadId);
      const nextThreads = threads.filter((thread) => thread.id !== threadId);
      setThreads(nextThreads);

      if (activeThread?.id === threadId) {
        const nextThread = nextThreads[0] ?? null;
        setActiveThread(nextThread);
        setEvents(nextThread?.events ?? []);
      }
    } catch (error) {
      setNotice(errorMessage(error, "Chat could not be deleted."));
    }
  }

  async function submitMessage() {
    const message = input.trim();

    if (!message || isBusy) {
      return;
    }

    setInput("");
    setIsBusy(true);
    setNotice(null);
    setTranscriptOpen(true);

    try {
      const thread = activeThread ?? await createAssistantThread({ title: titleFromMessage(message) });

      if (!activeThread) {
        setActiveThread(thread);
        setThreads((current) => [thread, ...current]);
      }

      await streamAssistantTurn({
        message,
        model: selectedAssistantModel,
        threadId: thread.id,
        onEvent: (event) => {
          setEvents((current) => [...current, event]);
        }
      });

      void refreshThreads();
    } catch (error) {
      const failedEvent = localAssistantEvent("turn.failed", {
        message: errorMessage(error, "Assistant turn failed.")
      });
      setEvents((current) => [...current, failedEvent]);
    } finally {
      setIsBusy(false);
    }
  }

  async function stopTurn() {
    if (!isBusy && !hasOpenTurn) {
      return;
    }

    setNotice("Stopping Memoria assistant...");

    try {
      await stopAssistantTurn(activeThread?.id ?? null);
    } catch (error) {
      setNotice(errorMessage(error, "Assistant could not be stopped."));
    } finally {
      setIsBusy(false);
    }
  }

  async function importFile(file: File) {
    setNotice(null);

    try {
      const deduped = await onImportFile(file);
      setNotice(deduped ? "Source already exists in this domain." : `Imported document: ${titleFromFileName(file.name)}`);
    } catch (error) {
      setNotice(errorMessage(error, "Document could not be imported."));
    }
  }

  return (
    <section aria-label="Memoria composer" className="assistant-composer-dock">
      <div className={`assistant-transcript ${transcriptOpen ? "open" : ""}`} id="memoria-composer-transcript">
        <div className="assistant-transcript-scroll atlas-transcript-scroll" ref={transcriptRef}>
          {transcriptItems.length === 0 ? (
            <ComposerTranscriptMessage from="assistant">
              <MarkdownText>
                {status?.ready
                  ? "Ask Memoria about the current graph, documents, view, or selected record."
                  : "Memoria assistant is starting."}
              </MarkdownText>
            </ComposerTranscriptMessage>
          ) : null}

          {transcriptItems.map((item) =>
            item.type === "message" ? (
              <ComposerTranscriptMessage from={item.message.role} key={item.message.id}>
                <MarkdownText>{item.message.text}</MarkdownText>
              </ComposerTranscriptMessage>
            ) : (
              <ToolActivityCard activity={item.activity} key={item.activity.id} />
            )
          )}

          {historyOpen ? (
            <ChatHistory
              activeThreadId={activeThread?.id ?? null}
              isLoading={isHistoryLoading}
              threads={threads}
              onDelete={removeThread}
              onRefresh={refreshThreads}
              onSelect={selectThread}
            />
          ) : null}

          {notice ? (
            <ComposerTranscriptMessage from="assistant">
              <MarkdownText>{notice}</MarkdownText>
            </ComposerTranscriptMessage>
          ) : null}

          {isBusy || hasOpenTurn ? <ComposerThinkingMessage /> : null}
        </div>
      </div>

      <input
        accept=".md,.markdown,.html,.htm,.pdf,text/markdown,text/html,application/pdf"
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0] ?? null;
          event.currentTarget.value = "";

          if (file) {
            void importFile(file);
          }
        }}
        ref={fileInputRef}
        type="file"
      />

      <div className="assistant-composer-frame">
        <form
          className="assistant-composer-shell"
          onSubmit={(event) => {
            event.preventDefault();
            void submitMessage();
          }}
        >
          <button
            aria-controls="memoria-composer-transcript"
            aria-expanded={transcriptOpen}
            aria-label={transcriptOpen ? "Hide transcript" : "Show transcript"}
            className="assistant-transcript-handle"
            data-open={transcriptOpen}
            onClick={() => setTranscriptOpen((open) => !open)}
            title={transcriptOpen ? "Hide transcript" : "Show transcript"}
            type="button"
          />
          <div className="assistant-composer-header">
            <Button
              aria-label="Assistant model settings"
              className="assistant-model-chip"
              disabled={isBusy}
              onClick={openAssistantModelDialog}
              type="button"
              variant="outline"
            >
              {modelChipLabel(selectedAssistantModel)}
            </Button>
          </div>
          <textarea
            aria-label="Message Memoria"
            className="assistant-composer-input"
            disabled={isBusy}
            onChange={(event) => setInput(event.currentTarget.value)}
            onFocus={() => setTranscriptOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submitMessage();
              }
            }}
            placeholder="Ask Memoria anything..."
            rows={2}
            value={input}
          />
          <footer className="assistant-composer-footer">
            <div className="assistant-tool-group">
              <ComposerIconButton
                disabled={isBusy}
                label="Upload document"
                onClick={() => fileInputRef.current?.click()}
              >
                <Plus />
              </ComposerIconButton>
              <ComposerIconButton
                label="Show saved chats"
                onClick={() => {
                  setTranscriptOpen(true);
                  setHistoryOpen((open) => !open);
                  void refreshThreads();
                }}
                pressed={historyOpen}
              >
                <History />
              </ComposerIconButton>
              <ComposerIconButton disabled={isBusy} label="Reset Memoria session" onClick={resetThread}>
                <RotateCcw />
              </ComposerIconButton>
            </div>

            <div className="assistant-tool-group align-right">
              <Button
                aria-label={isBusy ? "Stop assistant" : "Send message"}
                className="assistant-submit-button"
                disabled={!isBusy && !input.trim()}
                onClick={
                  isBusy
                    ? (event) => {
                        event.preventDefault();
                        void stopTurn();
                      }
                    : undefined
                }
                size="icon-sm"
                title={isBusy ? "Stop assistant" : "Send message"}
                type={isBusy ? "button" : "submit"}
              >
                {isBusy ? <Square /> : <ArrowUp />}
              </Button>
            </div>
          </footer>
        </form>
      </div>
      <Dialog open={assistantModelDialogOpen} onOpenChange={setAssistantModelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assistant model</DialogTitle>
            <DialogDescription>Choose the model string sent with each Memoria assistant turn.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="assistant-model-number">Model number</FieldLabel>
              <Input
                aria-label="Model number"
                id="assistant-model-number"
                onChange={(event) => setAssistantModelDraft((draft) => ({ ...draft, number: event.currentTarget.value }))}
                placeholder="5.5"
                value={assistantModelDraft.number}
              />
            </Field>
            <Field>
              <FieldLabel>Model</FieldLabel>
              <Select
                value={assistantModelDraft.family}
                onValueChange={(family) => setAssistantModelDraft((draft) => ({ ...draft, family }))}
              >
                <SelectTrigger aria-label="Model family">
                  <SelectValue placeholder="Model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {ASSISTANT_MODEL_FAMILIES.map((family) => (
                      <SelectItem key={family} value={family}>
                        {family === "standard" ? "Standard" : titleCase(family)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Effort</FieldLabel>
              <Select
                value={assistantModelDraft.effort}
                onValueChange={(effort) => setAssistantModelDraft((draft) => ({ ...draft, effort }))}
              >
                <SelectTrigger aria-label="Effort">
                  <SelectValue placeholder="Effort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {ASSISTANT_MODEL_EFFORTS.map((effort) => (
                      <SelectItem key={effort} value={effort}>
                        {effort === "auto" ? "Auto" : titleCase(effort)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button onClick={() => setAssistantModelDialogOpen(false)} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={!assistantModelDraft.number.trim()} onClick={saveAssistantModelDraft} type="button">
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ComposerIconButton({
  children,
  disabled = false,
  label,
  onClick,
  pressed = false
}: {
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void | Promise<void>;
  pressed?: boolean;
}) {
  return (
    <Button
      aria-label={label}
      aria-pressed={pressed}
      className="assistant-tool-button"
      data-active={pressed}
      disabled={disabled}
      onClick={() => void onClick()}
      size="icon-sm"
      title={label}
      type="button"
      variant={pressed ? "default" : "outline"}
    >
      {children}
    </Button>
  );
}

function ComposerTranscriptMessage({
  children,
  from
}: {
  children: ReactNode;
  from: "assistant" | "user";
}) {
  return (
    <article className={`assistant-message ${from}`}>
      <span className="sr-only">{from === "user" ? "You" : "Memoria"}</span>
      <div className="assistant-message-content">{children}</div>
    </article>
  );
}

function MarkdownText({ children }: { children: string }) {
  return (
    <div className="assistant-markdown">
      <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

const markdownComponents: Components = {
  a: ({ children, href }) => (
    <a href={href} rel="noreferrer" target="_blank">
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="assistant-markdown-table">
      <table>{children}</table>
    </div>
  ),
};

function ComposerThinkingMessage() {
  return (
    <div aria-live="polite" className="assistant-thinking">
      <span className="atlas-shimmer-text">Thinking...</span>
    </div>
  );
}

function ToolActivityCard({ activity }: { activity: ToolActivity }) {
  const [open, setOpen] = useState(activity.state !== "completed");

  return (
    <article className="assistant-tool-card">
      <button className="assistant-tool-card-trigger" onClick={() => setOpen((value) => !value)} type="button">
        <span className="assistant-tool-card-title">
          <Wrench />
          <span>{activity.label}</span>
          <span className={`assistant-tool-state ${activity.state}`}>{toolStateLabel(activity.state)}</span>
        </span>
        <ChevronDown className={open ? "open" : ""} />
      </button>
      {open ? (
        <div className="assistant-tool-card-body">
          {activity.detail || "Working"}
        </div>
      ) : null}
    </article>
  );
}

function ChatHistory({
  activeThreadId,
  isLoading,
  threads,
  onDelete,
  onRefresh,
  onSelect
}: {
  activeThreadId: string | null;
  isLoading: boolean;
  threads: AssistantThread[];
  onDelete: (threadId: string) => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
  onSelect: (threadId: string) => void | Promise<void>;
}) {
  return (
    <article className="assistant-history-card">
      <header>
        <div>
          <h2>Saved chats</h2>
          <p>{isLoading ? "Loading" : `${threads.length} recent chat${threads.length === 1 ? "" : "s"}`}</p>
        </div>
        <Button disabled={isLoading} onClick={() => void onRefresh()} size="sm" type="button" variant="ghost">
          Refresh
        </Button>
      </header>
      <div className="assistant-history-list">
        {threads.length === 0 ? <p>No saved chats yet.</p> : null}
        {threads.map((thread) => (
          <div className={`assistant-history-row ${thread.id === activeThreadId ? "active" : ""}`} key={thread.id}>
            <button onClick={() => void onSelect(thread.id)} type="button">
              <span>{thread.title}</span>
              <small>{formatTimestamp(thread.updated)}</small>
            </button>
            <Button
              aria-label={`Delete ${thread.title}`}
              onClick={() => void onDelete(thread.id)}
              size="icon-sm"
              title="Delete"
              type="button"
              variant="ghost"
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>
    </article>
  );
}

function reduceAssistantEventsToTranscript(events: AssistantEvent[]) {
  const transcriptItems: TranscriptItem[] = [];
  const toolItems = new Map<string, ToolActivity>();
  let activeAssistant: ComposerMessage | null = null;

  for (const event of events) {
    if (event.type === "user.message") {
      activeAssistant = null;
      const message = {
        id: event.id,
        role: "user",
        text: String(event.payload.text ?? "")
      } satisfies ComposerMessage;
      transcriptItems.push({ message, type: "message" });
    }

    if (event.type === "assistant.message.delta") {
      const itemId = String(event.payload.item_id ?? "assistant");
      const text = String(event.payload.text ?? "");

      if (!activeAssistant || activeAssistant.id !== itemId) {
        activeAssistant = {
          id: itemId,
          role: "assistant",
          text: ""
        };
        transcriptItems.push({ message: activeAssistant, type: "message" });
      }

      activeAssistant.text += text;
    }

    if (event.type.startsWith("tool.")) {
      activeAssistant = null;
      const id = String(event.payload.item_id ?? event.id);
      const state = event.type === "tool.completed" ? "completed" : event.type === "tool.failed" ? "failed" : "started";
      const existing = toolItems.get(id);
      const activity = existing ?? {
        detail: "",
        id,
        label: "Tool",
        state
      };

      activity.detail = String(event.payload.detail ?? activity.detail);
      activity.label = String(event.payload.label ?? activity.label);
      activity.state = state;

      if (!existing) {
        toolItems.set(id, activity);
        transcriptItems.push({ activity, type: "tool" });
      }
    }

    if (event.type === "turn.failed") {
      activeAssistant = null;
      const message = {
        id: event.id,
        role: "assistant",
        text: String(event.payload.message ?? "The assistant turn failed.")
      } satisfies ComposerMessage;
      transcriptItems.push({ message, type: "message" });
    }
  }

  return transcriptItems.filter((item) => item.type === "tool" || item.message.text.trim());
}

function localAssistantEvent(type: AssistantEvent["type"], payload: Record<string, unknown>): AssistantEvent {
  return {
    created: new Date().toISOString(),
    id: `local-${crypto.randomUUID()}`,
    payload,
    type
  };
}

function titleFromMessage(message: string) {
  return message.slice(0, 48) || "New chat";
}

function titleFromFileName(filename: string) {
  return filename.replace(/\.[^.]+$/i, "").replaceAll(/[-_]+/g, " ").trim() || "Untitled document";
}

function modelFormFromValue(value: string): AssistantModelForm {
  const normalized = value.trim().toLowerCase().replace(/^gpt-/, "");
  const parts = normalized.split("-").filter(Boolean);
  const family = ASSISTANT_MODEL_FAMILIES.includes(parts[1]) ? parts[1] : "standard";
  const effortCandidate = family === "standard" ? parts[1] : parts[2];
  const effort = ASSISTANT_MODEL_EFFORTS.includes(effortCandidate) ? effortCandidate : "auto";

  return {
    effort,
    family,
    number: parts[0] || DEFAULT_WORKBENCH_MODEL.replace(/^gpt-/i, "")
  };
}

function modelValueFromForm(form: AssistantModelForm) {
  const number = form.number.trim().replace(/^gpt-/i, "") || DEFAULT_WORKBENCH_MODEL.replace(/^gpt-/i, "");
  const family = form.family === "standard" ? "" : `-${form.family}`;
  const effort = form.effort === "auto" ? "" : `-${form.effort}`;

  return `gpt-${number}${family}${effort}`;
}

function modelChipLabel(value: string) {
  return modelValueFromForm(modelFormFromValue(value)).toUpperCase();
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function toolStateLabel(state: ToolActivity["state"]) {
  if (state === "completed") {
    return "Completed";
  }

  if (state === "failed") {
    return "Error";
  }

  return "Running";
}

function formatTimestamp(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
