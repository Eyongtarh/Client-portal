// Owner's view of a single client: tabbed access to the
// project overview, documents, messages, and invoices.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "../lib/api";
import LanguageToggle from "../components/LanguageToggle.jsx";

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
          <Link to="/" className="text-sm text-brand-600 underline">
            &larr; {t("clientDetail.allClients")}
          </Link>
          <h1 className="text-lg font-semibold mt-1">{client.company_name}</h1>
          <p className="text-sm text-gray-500">{client.contact_email}</p>
        </div>
        <LanguageToggle />
      </header>
      <nav className="max-w-2xl mx-auto px-8 pt-4 flex gap-1">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={
              activeTab === key
                ? "px-4 py-2 text-sm rounded-t-lg font-medium bg-white border border-b-0 border-brand-100"
                : "px-4 py-2 text-sm rounded-t-lg font-medium text-gray-500"
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
          {!project && activeTab !== "overview" && (
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

  return (
    <div>
      <h2 className="text-xl font-semibold">{project.name}</h2>
      <p className="text-sm text-gray-500 mb-3">
        {project.budget && `\u20ac${project.budget} \u00b7 `}
        {project.deadline && `Due ${project.deadline}`}
      </p>
      <div className="w-full bg-brand-100 rounded-full h-2 mb-1">
        <div
          className="bg-brand-600 h-2 rounded-full"
          style={{ width: `${project.progress_percent}%` }}
        />
      </div>
      <p className="text-xs text-gray-400 mb-6">
        {project.progress_percent}
        {t("clientDetail.percentComplete")}
      </p>
      <h3 className="font-medium mb-2">{t("clientDetail.milestones")}</h3>
      <ul className="space-y-1 mb-4">
        {project.milestones.map((milestone) => (
          <li key={milestone.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={milestone.is_complete}
              onChange={() => toggleMilestone(milestone)}
            />
            <span
              className={
                milestone.is_complete ? "line-through text-gray-400" : ""
              }
            >
              {milestone.title}
            </span>
          </li>
        ))}
      </ul>
      <form onSubmit={addMilestone} className="flex gap-2">
        <input
          value={newMilestone}
          onChange={(e) => setNewMilestone(e.target.value)}
          placeholder={t("clientDetail.addMilestone")}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
        <button className="bg-brand-50 text-brand-700 px-4 py-2 rounded-lg text-sm font-medium">
          {t("clientDetail.add")}
        </button>
      </form>
      <h3 className="font-medium mb-2 mt-6">{t("clientDetail.tasks")}</h3>
      <ul className="space-y-1 mb-4">
        {tasks.map((task) => (
          <li key={task.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={task.is_complete}
              onChange={() => toggleTask(task)}
            />
            <span
              className={task.is_complete ? "line-through text-gray-400" : ""}
            >
              {task.title}
            </span>
          </li>
        ))}
        {tasks.length === 0 && (
          <p className="text-gray-500 text-sm">{t("clientDetail.noTasks")}</p>
        )}
      </ul>
      <form onSubmit={addTask} className="flex gap-2">
        <input
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          placeholder={t("clientDetail.addTask")}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
        <button className="bg-brand-50 text-brand-700 px-4 py-2 rounded-lg text-sm font-medium">
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
      <input
        required
        placeholder={t("clientDetail.projectName")}
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full mb-3 px-3 py-2 border border-gray-300 rounded-lg text-sm"
      />
      <input
        type="number"
        placeholder={t("clientDetail.budget")}
        value={budget}
        onChange={(e) => setBudget(e.target.value)}
        className="w-full mb-3 px-3 py-2 border border-gray-300 rounded-lg text-sm"
      />
      <input
        type="date"
        value={deadline}
        onChange={(e) => setDeadline(e.target.value)}
        className="w-full mb-4 px-3 py-2 border border-gray-300 rounded-lg text-sm"
      />
      <button className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
        {t("clientDetail.createProject")}
      </button>
    </form>
  );
}

function DocumentsTab({ project }) {
  const { t } = useTranslation();
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);

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

  return (
    <div>
      <label className="inline-block mb-4 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium cursor-pointer">
        {uploading
          ? t("clientDetail.uploading")
          : t("clientDetail.uploadDocument")}
        <input
          type="file"
          className="hidden"
          onChange={onUpload}
          disabled={uploading}
        />
      </label>
      <ul className="divide-y divide-gray-100">
        {documents.map((doc) => (
          <li key={doc.id} className="py-2 flex justify-between text-sm">
            <a
              href={doc.file}
              target="_blank"
              rel="noreferrer"
              className="text-brand-700 hover:underline"
            >
              {doc.original_name}
            </a>
            <span className="text-gray-400">
              {(doc.size_bytes / 1024).toFixed(0)} KB
            </span>
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
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState("");

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

  return (
    <div>
      <div className="space-y-3 mb-4 max-h-72 overflow-y-auto">
        {messages.map((message) => (
          <div key={message.id} className="text-sm">
            <p className="text-xs text-gray-400">{message.sender_name}</p>
            <p className="inline-block px-3 py-2 rounded-lg bg-brand-50">
              {message.body}
            </p>
          </div>
        ))}
        {messages.length === 0 && (
          <p className="text-gray-500 text-sm">
            {t("clientDetail.noMessages")}
          </p>
        )}
      </div>
      <form onSubmit={onSend} className="flex gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("clientDetail.writeMessage")}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
        <button className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
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

  return (
    <div>
      <form
        onSubmit={onCreate}
        className="border border-gray-200 rounded-lg p-4 mb-6"
      >
        <h4 className="font-medium mb-3">{t("clientDetail.newInvoice")}</h4>
        <input
          required
          placeholder={t("clientDetail.invoiceNumber")}
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          className="w-full mb-3 px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
        {items.map((item, index) => (
          <div key={index} className="flex gap-2 mb-2">
            <input
              placeholder={t("clientDetail.description")}
              value={item.description}
              onChange={(e) => updateItem(index, "description", e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <input
              placeholder={t("clientDetail.amount")}
              type="number"
              value={item.amount}
              onChange={(e) => updateItem(index, "amount", e.target.value)}
              className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => setItems([...items, { description: "", amount: "" }])}
          className="text-sm text-brand-600 mb-3"
        >
          {t("clientDetail.addLineItem")}
        </button>
        <div>
          <button className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
            {t("clientDetail.createInvoice")}
          </button>
        </div>
      </form>
      <ul className="divide-y divide-gray-100">
        {invoices.map((invoice) => (
          <li
            key={invoice.id}
            className="py-3 flex justify-between items-center text-sm"
          >
            <div>
              <p className="font-medium">Invoice #{invoice.number}</p>
              <p className="text-gray-500">
                {`\u20ac${invoice.total} \u00b7 ${invoice.status}`}
              </p>
            </div>
            <button
              onClick={() => downloadPdf(invoice.id)}
              className="text-brand-700 underline"
            >
              {t("clientDetail.downloadPdf")}
            </button>
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
