// Owner's view of a single client: tabbed access to the
// project overview, documents, messages, invoices, and
// approvals. Documents, messages, and invoices each support
// full CRUD (create already existed; edit/delete added here).
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/AuthContext.jsx";
import api from "../lib/api";
import LanguageToggle from "../components/LanguageToggle.jsx";
import ActivityFeed from "../components/ActivityFeed.jsx";

export default function ClientDetail() {
  const { t } = useTranslation();
  const { clientId } = useParams();
  const [client, setClient] = useState(null);
  const [projects, setProjects] = useState([]);
  const [activeTab, setActiveTab] = useState("overview");

  const tabs = [
    ["overview", t("clientDetail.tabOverview")],
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
    return <div className="p-8 text-gray-500">Loading...</div>;
  }

  const project = projects[0];

  return (
    <div className="min-h-screen bg-brand-50">
      <header className="bg-white border-b border-brand-100 px-8 py-4 flex justify-between items-start">
        <div>
          <Link
            to="/"
            aria-label={t("clientDetail.allClients")}
            className="text-sm text-brand-600 underline transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
          >
            &larr; {t("clientDetail.allClients")}
          </Link>
          <h1 className="text-lg font-semibold mt-1">{client.company_name}</h1>
          <p className="text-sm text-gray-500">{client.contact_email}</p>
        </div>
        <LanguageToggle />
      </header>
      <nav
        className="max-w-2xl mx-auto px-8 pt-4 flex gap-1"
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
                ? "px-4 py-2 text-sm rounded-t-lg font-medium bg-white border border-b-0 border-brand-100 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
                : "px-4 py-2 text-sm rounded-t-lg font-medium text-gray-500 transition-colors hover:text-brand-700 hover:bg-white/60 focus:outline-none focus:ring-2 focus:ring-brand-400"
            }
          >
            {label}
          </button>
        ))}
      </nav>
      <main className="max-w-2xl mx-auto px-8 pb-8">
        <div className="bg-white border border-brand-100 rounded-b-xl rounded-tr-xl p-6">
          {activeTab === "overview" &&
            (project ? (
              <ProjectOverview project={project} onChange={load} />
            ) : (
              <NewProjectForm clientId={clientId} onCreated={load} />
            ))}
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
            <p className="text-gray-500 text-sm">
              {t("clientDetail.createProjectFirst")}
            </p>
          )}
        </div>
      </main>
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
      <h2 className="text-xl font-semibold">{project.name}</h2>
      <p className="text-sm text-gray-500 mb-3">
        {project.budget && `\u20ac${project.budget} \u00b7 `}
        {project.deadline && `Due ${project.deadline}`}
      </p>
      <div className="w-full bg-brand-100 rounded-full h-2 mb-1">
        <div
          className="bg-brand-600 h-2 rounded-full transition-all"
          style={{ width: `${project.progress_percent}%` }}
        />
      </div>
      <p className="text-xs text-gray-400 mb-6">
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

      <h3 className="font-medium mb-2">{t("clientDetail.milestones")}</h3>
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
                  className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                />
                <button
                  onClick={() => saveEditMilestone(milestone.id)}
                  aria-label={t("clientDetail.save")}
                  className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  {t("clientDetail.save")}
                </button>
                <button
                  onClick={cancelEditMilestone}
                  aria-label={t("clientDetail.cancel")}
                  className="bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
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
                      ? "line-through text-gray-400 cursor-pointer flex-1"
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
                  {t("clientDetail.editMilestone")}
                </button>
                <button
                  onClick={() => deleteMilestone(milestone.id)}
                  aria-label={`${t("clientDetail.deleteMilestone")} ${milestone.title}`}
                  className="bg-red-600 text-white text-xs px-2 py-1 rounded-lg font-medium transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400"
                >
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
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
        />
        <button
          aria-label={t("clientDetail.add")}
          className="bg-brand-50 text-brand-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
        >
          {t("clientDetail.add")}
        </button>
      </form>
      <h3 className="font-medium mb-2 mt-6">{t("clientDetail.tasks")}</h3>
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
                  className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                />
                <button
                  onClick={() => saveEditTask(task.id)}
                  aria-label={t("clientDetail.save")}
                  className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  {t("clientDetail.save")}
                </button>
                <button
                  onClick={cancelEditTask}
                  aria-label={t("clientDetail.cancel")}
                  className="bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
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
                      ? "line-through text-gray-400 cursor-pointer flex-1"
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
                  {t("clientDetail.editTask")}
                </button>
                <button
                  onClick={() => deleteTask(task.id)}
                  aria-label={`${t("clientDetail.deleteTask")} ${task.title}`}
                  className="bg-red-600 text-white text-xs px-2 py-1 rounded-lg font-medium transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400"
                >
                  {t("clientDetail.deleteTask")}
                </button>
              </div>
            )}
          </li>
        ))}
        {tasks.length === 0 && (
          <p className="text-gray-500 text-sm">{t("clientDetail.noTasks")}</p>
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
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
        />
        <button
          aria-label={t("clientDetail.add")}
          className="bg-brand-50 text-brand-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
        >
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
      <h2 className="font-medium mb-4">
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
        className="w-full mb-3 px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
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
        className="w-full mb-3 px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
      />
      <label htmlFor="new-project-deadline" className="sr-only">
        Deadline
      </label>
      <input
        id="new-project-deadline"
        type="date"
        value={deadline}
        onChange={(e) => setDeadline(e.target.value)}
        className="w-full mb-4 px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
      />
      <button
        aria-label={t("clientDetail.createProject")}
        className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
      >
        {t("clientDetail.createProject")}
      </button>
    </form>
  );
}

function DocumentsTab({ project }) {
  const { t } = useTranslation();
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
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

  async function onUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("project", project.id);
    try {
      await api.post("/documents/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await load();
    } finally {
      setUploading(false);
    }
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
      <label
        className="inline-block mb-4 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors hover:bg-brand-700 focus-within:ring-2 focus-within:ring-brand-400"
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

      <ul className="divide-y divide-gray-100">
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
                  className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                />
                <button
                  onClick={() => saveEdit(doc.id)}
                  aria-label={t("clientDetail.save")}
                  className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  {t("clientDetail.save")}
                </button>
                <button
                  onClick={cancelEdit}
                  aria-label={t("clientDetail.cancel")}
                  className="bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  {t("clientDetail.cancel")}
                </button>
              </div>
            ) : (
              <div className="flex justify-between items-center gap-3">
                <a
                  href={doc.file}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open ${doc.original_name} in a new tab`}
                  className="text-brand-700 transition-colors hover:text-brand-900 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-400 rounded truncate"
                >
                  {doc.original_name}
                </a>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-gray-400">
                    {(doc.size_bytes / 1024).toFixed(0)} KB
                  </span>
                  <button
                    onClick={() => startEdit(doc)}
                    aria-label={`${t("clientDetail.renameDocument")} ${doc.original_name}`}
                    className="bg-brand-50 text-brand-700 text-xs px-2.5 py-1 rounded-lg font-medium transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    {t("clientDetail.renameDocument")}
                  </button>
                  <button
                    onClick={() => deleteDocument(doc.id)}
                    aria-label={`${t("clientDetail.deleteDocument")} ${doc.original_name}`}
                    className="bg-red-600 text-white text-xs px-2.5 py-1 rounded-lg font-medium transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400"
                  >
                    {t("clientDetail.deleteDocument")}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
        {documents.length === 0 && (
          <p className="text-gray-500 text-sm">
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

  async function onSend(e) {
    e.preventDefault();
    if (!body.trim()) return;
    await api.post("/messages/", {
      project: project.id,
      body,
    });
    setBody("");
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
              <p className="text-xs text-gray-400">{message.sender_name}</p>
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
                    className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  />
                  <button
                    onClick={() => saveEdit(message.id)}
                    aria-label={t("clientDetail.save")}
                    className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    {t("clientDetail.save")}
                  </button>
                  <button
                    onClick={cancelEdit}
                    aria-label={t("clientDetail.cancel")}
                    className="bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    {t("clientDetail.cancel")}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="inline-block px-3 py-2 rounded-lg bg-brand-50">
                    {message.body}
                  </p>
                  {isOwnMessage && (
                    <button
                      onClick={() => startEdit(message)}
                      aria-label={t("clientDetail.editMessage")}
                      className="bg-brand-50 text-brand-700 text-xs px-2 py-1 rounded-lg font-medium transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                    >
                      {t("clientDetail.editMessage")}
                    </button>
                  )}
                  <button
                    onClick={() => deleteMessage(message.id)}
                    aria-label={t("clientDetail.deleteMessage")}
                    className="bg-red-600 text-white text-xs px-2 py-1 rounded-lg font-medium transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400"
                  >
                    {t("clientDetail.deleteMessage")}
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {messages.length === 0 && (
          <p className="text-gray-500 text-sm">
            {t("clientDetail.noMessages")}
          </p>
        )}
      </div>
      <form onSubmit={onSend} className="flex gap-2">
        <label htmlFor="owner-message" className="sr-only">
          {t("clientDetail.writeMessage")}
        </label>
        <input
          id="owner-message"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("clientDetail.writeMessage")}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
        />
        <button
          aria-label={t("clientDetail.send")}
          className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
        >
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

  return (
    <div>
      <form
        onSubmit={onCreate}
        className="border border-gray-200 rounded-lg p-4 mb-6"
      >
        <h4 className="font-medium mb-3">{t("clientDetail.newInvoice")}</h4>
        <label htmlFor="invoice-number" className="sr-only">
          {t("clientDetail.invoiceNumber")}
        </label>
        <input
          id="invoice-number"
          required
          placeholder={t("clientDetail.invoiceNumber")}
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          className="w-full mb-3 px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
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
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
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
              className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => setItems([...items, { description: "", amount: "" }])}
          aria-label={t("clientDetail.addLineItem")}
          className="text-sm text-brand-600 mb-3 transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
        >
          {t("clientDetail.addLineItem")}
        </button>
        <div>
          <button
            aria-label={t("clientDetail.createInvoice")}
            className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
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

      <ul className="divide-y divide-gray-100">
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
                  className="w-full mb-2 px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
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
                      className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
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
                      className="w-24 px-3 py-1.5 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
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
                  {t("clientDetail.addLineItem")}
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => saveEdit(invoice.id)}
                    aria-label={t("clientDetail.save")}
                    className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    {t("clientDetail.save")}
                  </button>
                  <button
                    onClick={cancelEdit}
                    aria-label={t("clientDetail.cancel")}
                    className="bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    {t("clientDetail.cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-medium">Invoice #{invoice.number}</p>
                  <p className="text-gray-500">
                    {`\u20ac${invoice.total} \u00b7 ${invoice.status}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => downloadPdf(invoice.id)}
                    aria-label={`Download invoice ${invoice.number} as PDF`}
                    className="text-brand-700 underline transition-colors hover:text-brand-900 focus:outline-none focus:ring-2 focus:ring-brand-400 rounded"
                  >
                    {t("clientDetail.downloadPdf")}
                  </button>
                  <button
                    onClick={() => startEdit(invoice)}
                    aria-label={`${t("clientDetail.editInvoice")} ${invoice.number}`}
                    className="bg-brand-50 text-brand-700 text-xs px-2.5 py-1 rounded-lg font-medium transition-colors hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    {t("clientDetail.editInvoice")}
                  </button>
                  <button
                    onClick={() => deleteInvoice(invoice.id)}
                    aria-label={`${t("clientDetail.deleteInvoice")} ${invoice.number}`}
                    className="bg-red-600 text-white text-xs px-2.5 py-1 rounded-lg font-medium transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400"
                  >
                    {t("clientDetail.deleteInvoice")}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
        {invoices.length === 0 && (
          <p className="text-gray-500 text-sm">
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
    return "bg-gray-50 text-gray-600 border-gray-200";
  }

  return (
    <div>
      <form
        onSubmit={onCreate}
        className="border border-gray-200 rounded-lg p-4 mb-6"
      >
        <h4 className="font-medium mb-3">{t("clientDetail.newApproval")}</h4>
        <label htmlFor="approval-title" className="sr-only">
          {t("clientDetail.approvalTitle")}
        </label>
        <input
          id="approval-title"
          required
          placeholder={t("clientDetail.approvalTitle")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full mb-3 px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
        />
        <label htmlFor="approval-description" className="sr-only">
          {t("clientDetail.approvalDescription")}
        </label>
        <textarea
          id="approval-description"
          placeholder={t("clientDetail.approvalDescription")}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full mb-3 px-3 py-2 border border-gray-300 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
          rows={2}
        />
        <button
          aria-label={t("clientDetail.createApproval")}
          className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
        >
          {t("clientDetail.createApproval")}
        </button>
      </form>
      <ul className="space-y-3">
        {approvals.map((approval) => (
          <li
            key={approval.id}
            className="border border-gray-200 rounded-lg p-4"
          >
            <div className="flex justify-between items-start mb-1">
              <p className="font-medium">{approval.title}</p>
              <span
                className={`text-xs px-2 py-1 rounded-full border ${statusClass(approval.status)}`}
              >
                {statusLabel(approval.status)}
              </span>
            </div>
            {approval.description && (
              <p className="text-sm text-gray-600 mb-1">
                {approval.description}
              </p>
            )}
            {approval.client_comment && (
              <p className="text-sm text-gray-500 italic">
                &ldquo;{approval.client_comment}&rdquo;
              </p>
            )}
          </li>
        ))}
        {approvals.length === 0 && (
          <p className="text-gray-500 text-sm">
            {t("clientDetail.noApprovals")}
          </p>
        )}
      </ul>
    </div>
  );
}
