// Owner's view of a single client: tabbed access to the
// project overview, documents, messages, invoices, and
// approvals. Documents, messages, and invoices each support
// full CRUD (create already existed; edit/delete added here).
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  FiCheck,
  FiCheckCircle,
  FiDownload,
  FiEdit2,
  FiLock,
  FiPaperclip,
  FiPlus,
  FiSend,
  FiTrash2,
  FiUnlock,
  FiX,
} from "react-icons/fi";
import { useAuth } from "../lib/AuthContext.jsx";
import api from "../lib/api";
import LanguageToggle from "../components/LanguageToggle.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";
import NotificationBell from "../components/NotificationBell.jsx";
import ActivityFeed from "../components/ActivityFeed.jsx";
import MobileNav from "../components/MobileNav.jsx";
import SkipLink from "../components/SkipLink.jsx";

export default function ClientDetail() {
  const { t } = useTranslation();
  const { clientId } = useParams();
  const [client, setClient] = useState(null);
  const [projects, setProjects] = useState([]);
  const [activeTab, setActiveTab] = useState("overview");

  const tabs = [
    ["overview", t("clientDetail.tabOverview")],
    ["notes", t("clientDetail.tabNotes")],
    ["documents", t("clientDetail.tabDocuments")],
    ["messages", t("clientDetail.tabMessages")],
    ["invoices", t("clientDetail.tabInvoices")],
    ["approvals", t("clientDetail.tabApprovals")],
    ["activity", t("activity.title")],
  ];
  async function load() {
    const clientRes = await api.get(`/clients/${clientId}/`);
    setClient(clientRes.data);
    const projectRes = await api.get(`/projects/?client=${clientId}`);
    setProjects(projectRes.data);
  }
  useEffect(() => {
    load();
  }, [clientId]);

  if (!client) {
    return <div className="p-8 text-ink-soft">Loading...</div>;
  }

  const project = projects[0];

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <SkipLink />
      <header className="sticky top-0 z-10 glass-panel px-8 py-4 flex justify-between items-start">
        <div>
          <Link
            to="/"
            aria-label={t("clientDetail.allClients")}
            className="text-sm text-brand-600 underline transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
          >
            &larr; {t("clientDetail.allClients")}
          </Link>
          <h1 className="text-lg font-semibold mt-1 text-ink">
            {client.company_name}
          </h1>
          <p className="text-sm text-ink-soft">{client.contact_email}</p>
        </div>
        <MobileNav>
          <NotificationBell />
          <ThemeToggle />
          <LanguageToggle />
        </MobileNav>
      </header>
      <nav
        className="max-w-2xl mx-auto px-8 pt-4 flex gap-1 overflow-x-auto"
        aria-label="Client detail tabs"
      >
        {tabs.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            aria-current={activeTab === key ? "page" : undefined}
            aria-label={label}
            className={
              activeTab === key
                ? "flex-shrink-0 whitespace-nowrap px-4 py-2 text-sm rounded-t-lg font-medium bg-surface border border-b-0 border-line transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
                : "flex-shrink-0 whitespace-nowrap px-4 py-2 text-sm rounded-t-lg font-medium text-ink-soft transition-colors hover:text-brand-700 hover:bg-surface/60 focus:outline-none focus:ring-2 focus:ring-brand-400"
            }
          >
            {label}
          </button>
        ))}
      </nav>
      <main id="main-content" className="max-w-2xl mx-auto px-8 pb-8">
        <div className="bg-surface border border-line rounded-b-2xl rounded-tr-2xl p-6">
          {activeTab === "overview" &&
            (project ? (
              <ProjectOverview project={project} onChange={load} />
            ) : (
              <NewProjectForm clientId={clientId} onCreated={load} />
            ))}
          {activeTab === "notes" && (
            <ClientNotesTab client={client} onChange={load} />
          )}
          {activeTab === "documents" && project && (
            <DocumentsTab project={project} />
          )}
          {activeTab === "messages" && project && (
            <MessagesTab project={project} />
          )}
          {activeTab === "invoices" && (
            <InvoicesTab client={client} project={project} />
          )}
          {activeTab === "approvals" && project && (
            <ApprovalsTab project={project} />
          )}
          {activeTab === "activity" && <ActivityFeed clientId={client.id} />}
          {!project && activeTab !== "overview" && activeTab !== "activity" && (
            <p className="text-ink-soft text-sm">
              {t("clientDetail.createProjectFirst")}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

function ClientNotesTab({ client, onChange }) {
  const { t } = useTranslation();
  const [notes, setNotes] = useState(client.notes || "");
  const [statusMsg, setStatusMsg] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [assignMsg, setAssignMsg] = useState(null);

  useEffect(() => {
    api.get("/team/").then((res) => setTeamMembers(res.data));
  }, []);

  async function save(e) {
    e.preventDefault();
    try {
      await api.patch(`/clients/${client.id}/`, { notes });
      setStatusMsg({ key: "clientDetail.notesUpdated", type: "success" });
      onChange();
    } catch {
      setStatusMsg({
        key: "clientDetail.couldNotUpdateNotes",
        type: "error",
      });
    }
  }

  async function toggleAssignedStaff(staffId, checked) {
    const current = client.assigned_staff || [];
    const next = checked
      ? [...current, staffId]
      : current.filter((id) => id !== staffId);
    try {
      await api.patch(`/clients/${client.id}/`, { assigned_staff: next });
      onChange();
    } catch {
      setAssignMsg({
        key: "clientDetail.couldNotUpdateAssignedStaff",
        type: "error",
      });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h4 className="font-medium mb-1 text-ink">
          {t("clientDetail.tabNotes")}
        </h4>
        <p className="text-xs text-ink-soft mb-3">
          {t("clientDetail.notesHint")}
        </p>
        {statusMsg && (
          <div
            role="status"
            className={
              statusMsg.type === "success"
                ? "mb-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3"
                : "mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3"
            }
          >
            {t(statusMsg.key)}
          </div>
        )}
        <form onSubmit={save}>
          <label htmlFor="client-notes" className="sr-only">
            {t("clientDetail.tabNotes")}
          </label>
          <textarea
            id="client-notes"
            rows={6}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("clientDetail.notesPlaceholder")}
            className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
          />
          <button
            type="submit"
            className="mt-3 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            <FiCheck className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
            {t("clientDetail.save")}
          </button>
        </form>
      </div>

      {teamMembers.length > 0 && (
        <div>
          <h4 className="font-medium mb-1 text-ink">
            {t("clientDetail.assignedTeam")}
          </h4>
          <p className="text-xs text-ink-soft mb-3">
            {t("clientDetail.assignedTeamHint")}
          </p>
          {assignMsg && (
            <div
              role="status"
              className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3"
            >
              {t(assignMsg.key)}
            </div>
          )}
          <div className="space-y-2">
            {teamMembers.map((member) => (
              <label
                key={member.id}
                className="flex items-center gap-2 text-sm text-ink cursor-pointer w-fit"
              >
                <input
                  type="checkbox"
                  checked={(client.assigned_staff || []).includes(member.id)}
                  onChange={(e) =>
                    toggleAssignedStaff(member.id, e.target.checked)
                  }
                  className="rounded"
                />
                {member.first_name || member.email}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectOverview({ project, onChange }) {
  const { t } = useTranslation();
  const [newMilestone, setNewMilestone] = useState("");
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState("");
  const [statusMsg, setStatusMsg] = useState(null);
  const [editingMilestoneId, setEditingMilestoneId] = useState(null);
  const [editMilestoneTitle, setEditMilestoneTitle] = useState("");
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editTaskTitle, setEditTaskTitle] = useState("");

  async function toggleMilestone(milestone) {
    await api.patch(`/milestones/${milestone.id}/`, {
      is_complete: !milestone.is_complete,
    });
    onChange();
  }
  async function addMilestone(e) {
    e.preventDefault();
    if (!newMilestone.trim()) return;
    await api.post("/milestones/", {
      project: project.id,
      title: newMilestone,
      order: project.milestones.length,
    });
    setNewMilestone("");
    onChange();
  }

  function startEditMilestone(milestone) {
    setEditingMilestoneId(milestone.id);
    setEditMilestoneTitle(milestone.title);
  }
  function cancelEditMilestone() {
    setEditingMilestoneId(null);
  }
  async function saveEditMilestone(milestoneId) {
    try {
      await api.patch(`/milestones/${milestoneId}/`, {
        title: editMilestoneTitle,
      });
      setEditingMilestoneId(null);
      setStatusMsg({
        key: "clientDetail.milestoneUpdated",
        type: "success",
      });
      onChange();
    } catch (err) {
      setStatusMsg({
        key: "clientDetail.couldNotUpdateMilestone",
        type: "error",
      });
    }
  }
  async function deleteMilestone(milestoneId) {
    if (!window.confirm(t("clientDetail.confirmDeleteMilestone"))) return;
    try {
      await api.delete(`/milestones/${milestoneId}/`);
      setStatusMsg({ key: "clientDetail.milestoneDeleted", type: "error" });
      onChange();
    } catch (err) {
      setStatusMsg({
        key: "clientDetail.couldNotDeleteMilestone",
        type: "error",
      });
    }
  }

  async function loadTasks() {
    const res = await api.get(`/tasks/?project=${project.id}`);
    setTasks(res.data);
  }
  useEffect(() => {
    loadTasks();
  }, [project.id]);

  async function toggleTask(task) {
    await api.patch(`/tasks/${task.id}/`, {
      is_complete: !task.is_complete,
    });
    loadTasks();
  }
  async function addTask(e) {
    e.preventDefault();
    if (!newTask.trim()) return;
    await api.post("/tasks/", {
      project: project.id,
      title: newTask,
    });
    setNewTask("");
    loadTasks();
  }

  function startEditTask(task) {
    setEditingTaskId(task.id);
    setEditTaskTitle(task.title);
  }
  function cancelEditTask() {
    setEditingTaskId(null);
  }
  async function saveEditTask(taskId) {
    try {
      await api.patch(`/tasks/${taskId}/`, { title: editTaskTitle });
      setEditingTaskId(null);
      setStatusMsg({ key: "clientDetail.taskUpdated", type: "success" });
      loadTasks();
    } catch (err) {
      setStatusMsg({
        key: "clientDetail.couldNotUpdateTask",
        type: "error",
      });
    }
  }
  async function deleteTask(taskId) {
    if (!window.confirm(t("clientDetail.confirmDeleteTask"))) return;
    try {
      await api.delete(`/tasks/${taskId}/`);
      setStatusMsg({ key: "clientDetail.taskDeleted", type: "error" });
      loadTasks();
    } catch (err) {
      setStatusMsg({
        key: "clientDetail.couldNotDeleteTask",
        type: "error",
      });
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-ink">{project.name}</h2>
      <p className="text-sm text-ink-soft mb-3">
        {project.budget && `\u20ac${project.budget} \u00b7 `}
        {project.deadline && `Due ${project.deadline}`}
      </p>
      <div className="w-full bg-brand-100 rounded-full h-2 mb-1">
        <div
          className="bg-brand-600 h-2 rounded-full transition-all"
          style={{ width: `${project.progress_percent}%` }}
        />
      </div>
      <p className="text-xs text-ink-soft mb-6">
        {project.progress_percent}
        {t("clientDetail.percentComplete")}
      </p>

      {statusMsg && (
        <div
          role="status"
          className={
            statusMsg.type === "success"
              ? "mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3"
              : "mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3"
          }
        >
          {t(statusMsg.key)}
        </div>
      )}

      <h3 className="font-medium mb-2 text-ink">{t("clientDetail.milestones")}</h3>
      <ul className="space-y-1 mb-4">
        {project.milestones.map((milestone) => (
          <li key={milestone.id} className="text-sm">
            {editingMilestoneId === milestone.id ? (
              <div className="flex gap-2 items-center py-1">
                <label
                  htmlFor={`edit-milestone-${milestone.id}`}
                  className="sr-only"
                >
                  {t("clientDetail.editMilestone")}
                </label>
                <input
                  id={`edit-milestone-${milestone.id}`}
                  value={editMilestoneTitle}
                  onChange={(e) => setEditMilestoneTitle(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                />
                <button
                  onClick={() => saveEditMilestone(milestone.id)}
                  aria-label={t("clientDetail.save")}
                  className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <FiCheck className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                  {t("clientDetail.save")}
                </button>
                <button
                  onClick={cancelEditMilestone}
                  aria-label={t("clientDetail.cancel")}
                  className="bg-surface-2 text-ink-soft px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-line focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <FiX className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                  {t("clientDetail.cancel")}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`milestone-${milestone.id}`}
                  checked={milestone.is_complete}
                  onChange={() => toggleMilestone(milestone)}
                  aria-label={`Mark milestone "${milestone.title}" as ${milestone.is_complete ? "incomplete" : "complete"}`}
                  className="cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
                />
                <label
                  htmlFor={`milestone-${milestone.id}`}
                  className={
                    milestone.is_complete
                      ? "line-through text-ink-soft cursor-pointer flex-1"
                      : "cursor-pointer flex-1"
                  }
                >
                  {milestone.title}
                </label>
                <button
                  onClick={() => startEditMilestone(milestone)}
                  aria-label={`${t("clientDetail.editMilestone")} ${milestone.title}`}
                  className="bg-brand-50 text-brand-700 text-xs px-2 py-1 rounded-lg font-medium transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <FiEdit2 className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                  {t("clientDetail.editMilestone")}
                </button>
                <button
                  onClick={() => deleteMilestone(milestone.id)}
                  aria-label={`${t("clientDetail.deleteMilestone")} ${milestone.title}`}
                  className="bg-red-600 text-white text-xs px-2 py-1 rounded-lg font-medium transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400"
                >
                  <FiTrash2 className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                  {t("clientDetail.deleteMilestone")}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={addMilestone} className="flex gap-2">
        <label htmlFor="new-milestone" className="sr-only">
          {t("clientDetail.addMilestone")}
        </label>
        <input
          id="new-milestone"
          value={newMilestone}
          onChange={(e) => setNewMilestone(e.target.value)}
          placeholder={t("clientDetail.addMilestone")}
          className="flex-1 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
        />
        <button
          aria-label={t("clientDetail.add")}
          className="bg-brand-50 text-brand-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
        >
          <FiPlus className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
          {t("clientDetail.add")}
        </button>
      </form>
      <h3 className="font-medium mb-2 mt-6 text-ink">{t("clientDetail.tasks")}</h3>
      <ul className="space-y-1 mb-4">
        {tasks.map((task) => (
          <li key={task.id} className="text-sm">
            {editingTaskId === task.id ? (
              <div className="flex gap-2 items-center py-1">
                <label htmlFor={`edit-task-${task.id}`} className="sr-only">
                  {t("clientDetail.editTask")}
                </label>
                <input
                  id={`edit-task-${task.id}`}
                  value={editTaskTitle}
                  onChange={(e) => setEditTaskTitle(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                />
                <button
                  onClick={() => saveEditTask(task.id)}
                  aria-label={t("clientDetail.save")}
                  className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <FiCheck className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                  {t("clientDetail.save")}
                </button>
                <button
                  onClick={cancelEditTask}
                  aria-label={t("clientDetail.cancel")}
                  className="bg-surface-2 text-ink-soft px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-line focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <FiX className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                  {t("clientDetail.cancel")}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`task-${task.id}`}
                  checked={task.is_complete}
                  onChange={() => toggleTask(task)}
                  aria-label={`Mark task "${task.title}" as ${task.is_complete ? "incomplete" : "complete"}`}
                  className="cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
                />
                <label
                  htmlFor={`task-${task.id}`}
                  className={
                    task.is_complete
                      ? "line-through text-ink-soft cursor-pointer flex-1"
                      : "cursor-pointer flex-1"
                  }
                >
                  {task.title}
                </label>
                <button
                  onClick={() => startEditTask(task)}
                  aria-label={`${t("clientDetail.editTask")} ${task.title}`}
                  className="bg-brand-50 text-brand-700 text-xs px-2 py-1 rounded-lg font-medium transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <FiEdit2 className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                  {t("clientDetail.editTask")}
                </button>
                <button
                  onClick={() => deleteTask(task.id)}
                  aria-label={`${t("clientDetail.deleteTask")} ${task.title}`}
                  className="bg-red-600 text-white text-xs px-2 py-1 rounded-lg font-medium transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400"
                >
                  <FiTrash2 className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                  {t("clientDetail.deleteTask")}
                </button>
              </div>
            )}
          </li>
        ))}
        {tasks.length === 0 && (
          <p className="text-ink-soft text-sm">{t("clientDetail.noTasks")}</p>
        )}
      </ul>
      <form onSubmit={addTask} className="flex gap-2">
        <label htmlFor="new-task" className="sr-only">
          {t("clientDetail.addTask")}
        </label>
        <input
          id="new-task"
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          placeholder={t("clientDetail.addTask")}
          className="flex-1 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
        />
        <button
          aria-label={t("clientDetail.add")}
          className="bg-brand-50 text-brand-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
        >
          <FiPlus className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
          {t("clientDetail.add")}
        </button>
      </form>
    </div>
  );
}

function NewProjectForm({ clientId, onCreated }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [budget, setBudget] = useState("");
  const [deadline, setDeadline] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    await api.post("/projects/", {
      client: clientId,
      name,
      budget: budget || null,
      deadline: deadline || null,
    });
    onCreated();
  }

  return (
    <form onSubmit={onSubmit}>
      <h2 className="font-medium mb-4 text-ink">
        {t("clientDetail.createFirstProject")}
      </h2>
      <label htmlFor="new-project-name" className="sr-only">
        {t("clientDetail.projectName")}
      </label>
      <input
        id="new-project-name"
        required
        placeholder={t("clientDetail.projectName")}
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full mb-3 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
      />
      <label htmlFor="new-project-budget" className="sr-only">
        {t("clientDetail.budget")}
      </label>
      <input
        id="new-project-budget"
        type="number"
        placeholder={t("clientDetail.budget")}
        value={budget}
        onChange={(e) => setBudget(e.target.value)}
        className="w-full mb-3 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
      />
      <label htmlFor="new-project-deadline" className="sr-only">
        Deadline
      </label>
      <input
        id="new-project-deadline"
        type="date"
        value={deadline}
        onChange={(e) => setDeadline(e.target.value)}
        className="w-full mb-4 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
      />
      <button
        aria-label={t("clientDetail.createProject")}
        className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
      >
        <FiPlus className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
        {t("clientDetail.createProject")}
      </button>
    </form>
  );
}

const DOCUMENT_CATEGORIES = [
  "contract", "deliverable", "invoice", "reference", "other",
];

function DocumentsTab({ project }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isOwnerOrStaff = user.role === "owner" || user.role === "staff";
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadCategory, setUploadCategory] = useState("other");
  const [uploadPrivate, setUploadPrivate] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");

  async function load() {
    const res = await api.get(`/documents/?project=${project.id}`);
    setDocuments(res.data);
  }
  useEffect(() => {
    load();
  }, [project.id]);

  async function openFile(url) {
    const res = await api.get(url, { responseType: "blob" });
    const blobUrl = URL.createObjectURL(res.data);
    window.open(blobUrl, "_blank");
  }

  async function onUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("project", project.id);
    formData.append("category", uploadCategory);
    if (isOwnerOrStaff) {
      formData.append("is_private", uploadPrivate);
    }
    try {
      await api.post("/documents/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setUploadPrivate(false);
      await load();
    } finally {
      setUploading(false);
    }
  }

  async function togglePrivate(doc) {
    await api.patch(`/documents/${doc.id}/`, {
      is_private: !doc.is_private,
    });
    load();
  }

  function startEdit(doc) {
    setEditingId(doc.id);
    setEditName(doc.original_name);
  }
  function cancelEdit() {
    setEditingId(null);
  }
  async function saveEdit(docId) {
    try {
      await api.patch(`/documents/${docId}/`, {
        original_name: editName,
      });
      setEditingId(null);
      setStatusMsg({ key: "clientDetail.documentRenamed", type: "success" });
      load();
    } catch (err) {
      setStatusMsg({
        key: "clientDetail.couldNotRenameDocument",
        type: "error",
      });
    }
  }

  async function deleteDocument(docId) {
    if (!window.confirm(t("clientDetail.confirmDeleteDocument"))) return;
    try {
      await api.delete(`/documents/${docId}/`);
      setStatusMsg({ key: "clientDetail.documentDeleted", type: "error" });
      load();
    } catch (err) {
      setStatusMsg({
        key: "clientDetail.couldNotDeleteDocument",
        type: "error",
      });
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <label htmlFor="upload-category" className="sr-only">
          {t("clientDetail.documentCategory")}
        </label>
        <select
          id="upload-category"
          value={uploadCategory}
          onChange={(e) => setUploadCategory(e.target.value)}
          className="px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
        >
          {DOCUMENT_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {t(`clientDetail.category_${cat}`)}
            </option>
          ))}
        </select>
        {isOwnerOrStaff && (
          <label className="flex items-center gap-2 text-sm text-ink-soft cursor-pointer">
            <input
              type="checkbox"
              checked={uploadPrivate}
              onChange={(e) => setUploadPrivate(e.target.checked)}
              className="rounded"
            />
            {t("clientDetail.uploadAsPrivate")}
          </label>
        )}
        <label
          className="inline-block bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors hover:bg-brand-700 focus-within:ring-2 focus-within:ring-brand-400"
          title={t("clientDetail.uploadDocument")}
        >
          {uploading
            ? t("clientDetail.uploading")
            : t("clientDetail.uploadDocument")}
          <input
            type="file"
            className="hidden"
            onChange={onUpload}
            disabled={uploading}
            aria-label={t("clientDetail.uploadDocument")}
          />
        </label>
      </div>

      {statusMsg && (
        <div
          role="status"
          className={
            statusMsg.type === "success"
              ? "mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3"
              : "mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3"
          }
        >
          {t(statusMsg.key)}
        </div>
      )}

      <ul className="divide-y divide-line">
        {documents.map((doc) => (
          <li key={doc.id} className="py-2 text-sm">
            {editingId === doc.id ? (
              <div className="flex gap-2 items-center">
                <label htmlFor={`edit-doc-${doc.id}`} className="sr-only">
                  {t("clientDetail.renameDocument")}
                </label>
                <input
                  id={`edit-doc-${doc.id}`}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                />
                <button
                  onClick={() => saveEdit(doc.id)}
                  aria-label={t("clientDetail.save")}
                  className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <FiCheck className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                  {t("clientDetail.save")}
                </button>
                <button
                  onClick={cancelEdit}
                  aria-label={t("clientDetail.cancel")}
                  className="bg-surface-2 text-ink-soft px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-line focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <FiX className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                  {t("clientDetail.cancel")}
                </button>
              </div>
            ) : (
              <div className="flex justify-between items-center gap-3">
                <div className="min-w-0">
                  <button
                    onClick={() => openFile(doc.file_url)}
                    aria-label={`Open ${doc.original_name} in a new tab`}
                    className="w-full text-left text-brand-700 transition-colors hover:text-brand-900 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-400 rounded truncate block"
                  >
                    {doc.original_name}
                  </button>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-surface-2 text-ink-soft">
                      {t(`clientDetail.category_${doc.category}`)}
                    </span>
                    {doc.is_private && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 inline-flex items-center gap-1">
                        <FiLock size={11} aria-hidden="true" />
                        {t("clientDetail.private")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-ink-soft">
                    {(doc.size_bytes / 1024).toFixed(0)} KB
                  </span>
                  {isOwnerOrStaff && (
                    <button
                      onClick={() => togglePrivate(doc)}
                      aria-label={`${
                        doc.is_private
                          ? t("clientDetail.makePublic")
                          : t("clientDetail.makePrivate")
                      } ${doc.original_name}`}
                      className="bg-surface-2 text-ink-soft text-xs px-2.5 py-1 rounded-lg font-medium transition-colors hover:bg-line focus:outline-none focus:ring-2 focus:ring-brand-400"
                    >
                      {doc.is_private ? (
                        <FiUnlock className="inline -mt-0.5 mr-1 shrink-0" aria-hidden="true" />
                      ) : (
                        <FiLock className="inline -mt-0.5 mr-1 shrink-0" aria-hidden="true" />
                      )}
                      {doc.is_private
                        ? t("clientDetail.makePublic")
                        : t("clientDetail.makePrivate")}
                    </button>
                  )}
                  <button
                    onClick={() => startEdit(doc)}
                    aria-label={`${t("clientDetail.renameDocument")} ${doc.original_name}`}
                    className="bg-brand-50 text-brand-700 text-xs px-2.5 py-1 rounded-lg font-medium transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    <FiEdit2 className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                    {t("clientDetail.renameDocument")}
                  </button>
                  <button
                    onClick={() => deleteDocument(doc.id)}
                    aria-label={`${t("clientDetail.deleteDocument")} ${doc.original_name}`}
                    className="bg-red-600 text-white text-xs px-2.5 py-1 rounded-lg font-medium transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400"
                  >
                    <FiTrash2 className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                    {t("clientDetail.deleteDocument")}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
        {documents.length === 0 && (
          <p className="text-ink-soft text-sm">
            {t("clientDetail.noDocuments")}
          </p>
        )}
      </ul>
    </div>
  );
}

function MessagesTab({ project }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [statusMsg, setStatusMsg] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editBody, setEditBody] = useState("");

  async function load() {
    const res = await api.get(`/messages/?project=${project.id}`);
    setMessages(res.data);
  }
  useEffect(() => {
    load();
  }, [project.id]);

  async function openFile(url) {
    const res = await api.get(url, { responseType: "blob" });
    const blobUrl = URL.createObjectURL(res.data);
    window.open(blobUrl, "_blank");
  }

  async function onSend(e) {
    e.preventDefault();
    if (!body.trim() && !attachment) return;
    const formData = new FormData();
    formData.append("project", project.id);
    formData.append("body", body);
    if (attachment) formData.append("attachment", attachment);
    await api.post("/messages/", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    setBody("");
    setAttachment(null);
    load();
  }

  function startEdit(message) {
    setEditingId(message.id);
    setEditBody(message.body);
  }
  function cancelEdit() {
    setEditingId(null);
  }
  async function saveEdit(messageId) {
    try {
      await api.patch(`/messages/${messageId}/`, { body: editBody });
      setEditingId(null);
      setStatusMsg({ key: "clientDetail.messageUpdated", type: "success" });
      load();
    } catch (err) {
      setStatusMsg({
        key: "clientDetail.couldNotUpdateMessage",
        type: "error",
      });
    }
  }

  async function deleteMessage(messageId) {
    if (!window.confirm(t("clientDetail.confirmDeleteMessage"))) return;
    try {
      await api.delete(`/messages/${messageId}/`);
      setStatusMsg({ key: "clientDetail.messageDeleted", type: "error" });
      load();
    } catch (err) {
      setStatusMsg({
        key: "clientDetail.couldNotDeleteMessage",
        type: "error",
      });
    }
  }

  return (
    <div>
      {statusMsg && (
        <div
          role="status"
          className={
            statusMsg.type === "success"
              ? "mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3"
              : "mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3"
          }
        >
          {t(statusMsg.key)}
        </div>
      )}
      <div className="space-y-3 mb-4 max-h-72 overflow-y-auto">
        {messages.map((message) => {
          const isOwnMessage =
            message.sender_role === "owner" || message.sender_role === "staff";
          return (
            <div key={message.id} className="text-sm">
              <p className="text-xs text-ink-soft">{message.sender_name}</p>
              {editingId === message.id ? (
                <div className="flex gap-2 items-center">
                  <label
                    htmlFor={`edit-message-${message.id}`}
                    className="sr-only"
                  >
                    {t("clientDetail.editMessage")}
                  </label>
                  <input
                    id={`edit-message-${message.id}`}
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    className="flex-1 px-3 py-1.5 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  />
                  <button
                    onClick={() => saveEdit(message.id)}
                    aria-label={t("clientDetail.save")}
                    className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    <FiCheck className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                    {t("clientDetail.save")}
                  </button>
                  <button
                    onClick={cancelEdit}
                    aria-label={t("clientDetail.cancel")}
                    className="bg-surface-2 text-ink-soft px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-line focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    <FiX className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                    {t("clientDetail.cancel")}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {message.body && (
                    <p className="inline-block px-3 py-2 rounded-lg bg-brand-50">
                      {message.body}
                    </p>
                  )}
                  {message.attachment_url && (
                    <button
                      onClick={() => openFile(message.attachment_url)}
                      className="inline-flex items-center px-3 py-2 rounded-lg bg-brand-50 text-brand-700 text-sm font-medium hover:bg-brand-100"
                    >
                      <FiPaperclip className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                      {message.attachment_name}
                    </button>
                  )}
                  {isOwnMessage && (
                    <button
                      onClick={() => startEdit(message)}
                      aria-label={t("clientDetail.editMessage")}
                      className="bg-brand-50 text-brand-700 text-xs px-2 py-1 rounded-lg font-medium transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                    >
                      <FiEdit2 className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                      {t("clientDetail.editMessage")}
                    </button>
                  )}
                  <button
                    onClick={() => deleteMessage(message.id)}
                    aria-label={t("clientDetail.deleteMessage")}
                    className="bg-red-600 text-white text-xs px-2 py-1 rounded-lg font-medium transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400"
                  >
                    <FiTrash2 className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                    {t("clientDetail.deleteMessage")}
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {messages.length === 0 && (
          <p className="text-ink-soft text-sm">
            {t("clientDetail.noMessages")}
          </p>
        )}
      </div>
      {attachment && (
        <p className="text-xs text-ink-soft mb-1.5 flex items-center gap-1.5">
          <FiPaperclip className="shrink-0" aria-hidden="true" />
          {attachment.name}
          <button
            type="button"
            onClick={() => setAttachment(null)}
            aria-label={t("clientDetail.removeAttachment")}
            className="text-red-600 hover:underline"
          >
            {t("clientDetail.removeAttachment")}
          </button>
        </p>
      )}
      <form onSubmit={onSend} className="flex gap-2">
        <label htmlFor="owner-message" className="sr-only">
          {t("clientDetail.writeMessage")}
        </label>
        <input
          id="owner-message"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("clientDetail.writeMessage")}
          className="flex-1 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
        />
        <label
          htmlFor="owner-message-attachment"
          aria-label={t("clientDetail.attachFile")}
          className="flex items-center px-3 py-2 bg-surface-2 text-ink-soft rounded-lg text-sm font-medium cursor-pointer transition-colors hover:bg-line focus-within:ring-2 focus-within:ring-brand-400"
        >
          <FiPaperclip className="shrink-0" aria-hidden="true" />
          <input
            id="owner-message-attachment"
            type="file"
            className="sr-only"
            onChange={(e) => setAttachment(e.target.files[0] || null)}
          />
        </label>
        <button
          aria-label={t("clientDetail.send")}
          className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
        >
          <FiSend className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
          {t("clientDetail.send")}
        </button>
      </form>
    </div>
  );
}

function InvoicesTab({ client, project }) {
  const { t } = useTranslation();
  const [invoices, setInvoices] = useState([]);
  const [number, setNumber] = useState("");
  const [items, setItems] = useState([{ description: "", amount: "" }]);
  const [statusMsg, setStatusMsg] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editNumber, setEditNumber] = useState("");
  const [editItems, setEditItems] = useState([]);

  async function load() {
    const res = await api.get(`/invoices/?client=${client.id}`);
    setInvoices(res.data);
  }
  useEffect(() => {
    load();
  }, [client.id]);

  function updateItem(index, field, value) {
    const next = [...items];
    next[index][field] = value;
    setItems(next);
  }

  async function onCreate(e) {
    e.preventDefault();
    const validItems = items.filter((item) => item.description && item.amount);
    await api.post("/invoices/", {
      client: client.id,
      project: project?.id,
      number,
      items: validItems,
    });
    setNumber("");
    setItems([{ description: "", amount: "" }]);
    load();
  }
  async function downloadPdf(invoiceId) {
    const res = await api.get(`/invoices/${invoiceId}/pdf/`, {
      responseType: "blob",
    });
    const url = URL.createObjectURL(res.data);
    window.open(url, "_blank");
  }

  function startEdit(invoice) {
    setEditingId(invoice.id);
    setEditNumber(invoice.number);
    setEditItems(
      invoice.items.map((item) => ({
        description: item.description,
        amount: item.amount,
      })),
    );
  }
  function cancelEdit() {
    setEditingId(null);
  }
  function updateEditItem(index, field, value) {
    const next = [...editItems];
    next[index][field] = value;
    setEditItems(next);
  }
  async function saveEdit(invoiceId) {
    const validItems = editItems.filter(
      (item) => item.description && item.amount,
    );
    try {
      await api.patch(`/invoices/${invoiceId}/`, {
        number: editNumber,
        items: validItems,
      });
      setEditingId(null);
      setStatusMsg({ key: "clientDetail.invoiceUpdated", type: "success" });
      load();
    } catch (err) {
      setStatusMsg({
        key: "clientDetail.couldNotUpdateInvoice",
        type: "error",
      });
    }
  }

  async function deleteInvoice(invoiceId) {
    if (!window.confirm(t("clientDetail.confirmDeleteInvoice"))) return;
    try {
      await api.delete(`/invoices/${invoiceId}/`);
      setStatusMsg({ key: "clientDetail.invoiceDeleted", type: "error" });
      load();
    } catch (err) {
      setStatusMsg({
        key: "clientDetail.couldNotDeleteInvoice",
        type: "error",
      });
    }
  }

  async function markInvoicePaid(invoiceId) {
    if (!window.confirm(t("clientDetail.confirmMarkInvoicePaid"))) return;
    try {
      await api.patch(`/invoices/${invoiceId}/`, { status: "paid" });
      setStatusMsg({
        key: "clientDetail.invoiceMarkedPaid",
        type: "success",
      });
      load();
    } catch {
      setStatusMsg({
        key: "clientDetail.couldNotMarkInvoicePaid",
        type: "error",
      });
    }
  }

  return (
    <div>
      <form
        onSubmit={onCreate}
        className="border border-line rounded-lg p-4 mb-6"
      >
        <h4 className="font-medium mb-3 text-ink">{t("clientDetail.newInvoice")}</h4>
        <label htmlFor="invoice-number" className="sr-only">
          {t("clientDetail.invoiceNumber")}
        </label>
        <input
          id="invoice-number"
          required
          placeholder={t("clientDetail.invoiceNumber")}
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          className="w-full mb-3 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
        />
        {items.map((item, index) => (
          <div key={index} className="flex gap-2 mb-2">
            <label htmlFor={`invoice-item-desc-${index}`} className="sr-only">
              {t("clientDetail.description")}
            </label>
            <input
              id={`invoice-item-desc-${index}`}
              placeholder={t("clientDetail.description")}
              value={item.description}
              onChange={(e) => updateItem(index, "description", e.target.value)}
              className="flex-1 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
            />
            <label htmlFor={`invoice-item-amount-${index}`} className="sr-only">
              {t("clientDetail.amount")}
            </label>
            <input
              id={`invoice-item-amount-${index}`}
              placeholder={t("clientDetail.amount")}
              type="number"
              value={item.amount}
              onChange={(e) => updateItem(index, "amount", e.target.value)}
              className="w-28 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => setItems([...items, { description: "", amount: "" }])}
          aria-label={t("clientDetail.addLineItem")}
          className="text-sm text-brand-600 mb-3 transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
        >
          <FiPlus className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
          {t("clientDetail.addLineItem")}
        </button>
        <div>
          <button
            aria-label={t("clientDetail.createInvoice")}
            className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            <FiPlus className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
            {t("clientDetail.createInvoice")}
          </button>
        </div>
      </form>

      {statusMsg && (
        <div
          role="status"
          className={
            statusMsg.type === "success"
              ? "mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3"
              : "mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3"
          }
        >
          {t(statusMsg.key)}
        </div>
      )}

      <ul className="divide-y divide-line">
        {invoices.map((invoice) => (
          <li key={invoice.id} className="py-3 text-sm">
            {editingId === invoice.id ? (
              <div className="border border-brand-200 rounded-lg p-3">
                <label
                  htmlFor={`edit-invoice-number-${invoice.id}`}
                  className="sr-only"
                >
                  {t("clientDetail.invoiceNumber")}
                </label>
                <input
                  id={`edit-invoice-number-${invoice.id}`}
                  value={editNumber}
                  onChange={(e) => setEditNumber(e.target.value)}
                  className="w-full mb-2 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                />
                {editItems.map((item, index) => (
                  <div key={index} className="flex gap-2 mb-2">
                    <label
                      htmlFor={`edit-item-desc-${invoice.id}-${index}`}
                      className="sr-only"
                    >
                      {t("clientDetail.description")}
                    </label>
                    <input
                      id={`edit-item-desc-${invoice.id}-${index}`}
                      value={item.description}
                      onChange={(e) =>
                        updateEditItem(index, "description", e.target.value)
                      }
                      className="flex-1 px-3 py-1.5 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                    />
                    <label
                      htmlFor={`edit-item-amount-${invoice.id}-${index}`}
                      className="sr-only"
                    >
                      {t("clientDetail.amount")}
                    </label>
                    <input
                      id={`edit-item-amount-${invoice.id}-${index}`}
                      type="number"
                      value={item.amount}
                      onChange={(e) =>
                        updateEditItem(index, "amount", e.target.value)
                      }
                      className="w-24 px-3 py-1.5 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setEditItems([
                      ...editItems,
                      { description: "", amount: "" },
                    ])
                  }
                  aria-label={t("clientDetail.addLineItem")}
                  className="text-sm text-brand-600 mb-2 transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
                >
                  <FiPlus className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                  {t("clientDetail.addLineItem")}
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => saveEdit(invoice.id)}
                    aria-label={t("clientDetail.save")}
                    className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    <FiCheck className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                    {t("clientDetail.save")}
                  </button>
                  <button
                    onClick={cancelEdit}
                    aria-label={t("clientDetail.cancel")}
                    className="bg-surface-2 text-ink-soft px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-line focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    <FiX className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                    {t("clientDetail.cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                <div>
                  <p className="font-medium text-ink">Invoice #{invoice.number}</p>
                  <p className="text-ink-soft">
                    {`\u20ac${invoice.total} \u00b7 ${invoice.status}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {invoice.status !== "paid" && (
                    <button
                      onClick={() => markInvoicePaid(invoice.id)}
                      aria-label={`${t("clientDetail.markInvoicePaid")} ${invoice.number}`}
                      className="bg-green-50 text-green-700 text-xs px-2.5 py-1 rounded-lg font-medium transition-colors hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                    >
                      <FiCheckCircle className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                      {t("clientDetail.markInvoicePaid")}
                    </button>
                  )}
                  <button
                    onClick={() => downloadPdf(invoice.id)}
                    aria-label={`Download invoice ${invoice.number} as PDF`}
                    className="text-brand-700 underline transition-colors hover:text-brand-900 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
                  >
                    <FiDownload className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                    {t("clientDetail.downloadPdf")}
                  </button>
                  <button
                    onClick={() => startEdit(invoice)}
                    aria-label={`${t("clientDetail.editInvoice")} ${invoice.number}`}
                    className="bg-brand-50 text-brand-700 text-xs px-2.5 py-1 rounded-lg font-medium transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    <FiEdit2 className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                    {t("clientDetail.editInvoice")}
                  </button>
                  <button
                    onClick={() => deleteInvoice(invoice.id)}
                    aria-label={`${t("clientDetail.deleteInvoice")} ${invoice.number}`}
                    className="bg-red-600 text-white text-xs px-2.5 py-1 rounded-lg font-medium transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400"
                  >
                    <FiTrash2 className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
                    {t("clientDetail.deleteInvoice")}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
        {invoices.length === 0 && (
          <p className="text-ink-soft text-sm">
            {t("clientDetail.noInvoices")}
          </p>
        )}
      </ul>
    </div>
  );
}

function ApprovalsTab({ project }) {
  const { t } = useTranslation();
  const [approvals, setApprovals] = useState([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  async function load() {
    const res = await api.get(`/approvals/?project=${project.id}`);
    setApprovals(res.data);
  }
  useEffect(() => {
    load();
  }, [project.id]);

  async function onCreate(e) {
    e.preventDefault();
    await api.post("/approvals/", {
      project: project.id,
      title,
      description,
    });
    setTitle("");
    setDescription("");
    load();
  }

  function statusLabel(status) {
    if (status === "approved") return t("clientDetail.statusApproved");
    if (status === "changes_requested") {
      return t("clientDetail.statusChangesRequested");
    }
    return t("clientDetail.statusPending");
  }

  function statusClass(status) {
    if (status === "approved") {
      return "bg-green-50 text-green-700 border-green-200";
    }
    if (status === "changes_requested") {
      return "bg-red-50 text-red-700 border-red-200";
    }
    return "bg-gray-50 text-ink-soft border-gray-200";
  }

  return (
    <div>
      <form
        onSubmit={onCreate}
        className="border border-line rounded-lg p-4 mb-6"
      >
        <h4 className="font-medium mb-3 text-ink">{t("clientDetail.newApproval")}</h4>
        <label htmlFor="approval-title" className="sr-only">
          {t("clientDetail.approvalTitle")}
        </label>
        <input
          id="approval-title"
          required
          placeholder={t("clientDetail.approvalTitle")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full mb-3 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
        />
        <label htmlFor="approval-description" className="sr-only">
          {t("clientDetail.approvalDescription")}
        </label>
        <textarea
          id="approval-description"
          placeholder={t("clientDetail.approvalDescription")}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full mb-3 px-3 py-2 bg-canvas border border-line rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
          rows={2}
        />
        <button
          aria-label={t("clientDetail.createApproval")}
          className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
        >
          <FiPlus className="inline -mt-0.5 mr-1.5 shrink-0" aria-hidden="true" />
          {t("clientDetail.createApproval")}
        </button>
      </form>
      <ul className="space-y-3">
        {approvals.map((approval) => (
          <li
            key={approval.id}
            className="border border-line rounded-lg p-4"
          >
            <div className="flex justify-between items-start mb-1">
              <p className="font-medium text-ink">{approval.title}</p>
              <span
                className={`text-xs px-2 py-1 rounded-full border ${statusClass(approval.status)}`}
              >
                {statusLabel(approval.status)}
              </span>
            </div>
            {approval.description && (
              <p className="text-sm text-ink-soft mb-1">
                {approval.description}
              </p>
            )}
            {approval.client_comment && (
              <p className="text-sm text-ink-soft italic">
                &ldquo;{approval.client_comment}&rdquo;
              </p>
            )}
          </li>
        ))}
        {approvals.length === 0 && (
          <p className="text-ink-soft text-sm">
            {t("clientDetail.noApprovals")}
          </p>
        )}
      </ul>
    </div>
  );
}
