// Owner's view of a single client: project overview and
// milestone tracking. Documents/Messages/Invoices tabs come
// in later steps.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../lib/api";

export default function ClientDetail() {
  const { clientId } = useParams();
  const [client, setClient] = useState(null);
  const [projects, setProjects] = useState([]);

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
    <div className="min-h-screen bg-blue-50">
      <header
        className="bg-white border-b border-blue-100
        px-8 py-4"
      >
        <Link to="/" className="text-sm text-blue-600 underline">
          &larr; All clients
        </Link>
        <h1 className="text-lg font-semibold mt-1">{client.company_name}</h1>
        <p className="text-sm text-gray-500">{client.contact_email}</p>
      </header>
      <main className="max-w-2xl mx-auto px-8 py-8">
        {project ? (
          <ProjectOverview project={project} onChange={load} />
        ) : (
          <NewProjectForm clientId={clientId} onCreated={load} />
        )}
      </main>
    </div>
  );
}

function ProjectOverview({ project, onChange }) {
  const [newMilestone, setNewMilestone] = useState("");

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

  return (
    <div
      className="bg-white border border-blue-100
      rounded-xl p-6"
    >
      <h2 className="text-xl font-semibold">{project.name}</h2>
      <p className="text-sm text-gray-500 mb-3">
        {project.budget && `€${project.budget} · `}
        {project.deadline && `Due ${project.deadline}`}
      </p>
      <div
        className="w-full bg-blue-100 rounded-full h-2
        mb-1"
      >
        <div
          className="bg-blue-600 h-2 rounded-full"
          style={{ width: `${project.progress_percent}%` }}
        />
      </div>
      <p className="text-xs text-gray-400 mb-6">
        {project.progress_percent}% complete
      </p>
      <h3 className="font-medium mb-2">Milestones</h3>
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
          placeholder="Add milestone..."
          className="flex-1 px-3 py-2 border
            border-gray-300 rounded-lg text-sm"
        />
        <button
          className="bg-blue-50 text-blue-700 px-4
          py-2 rounded-lg text-sm font-medium"
        >
          Add
        </button>
      </form>
    </div>
  );
}

function NewProjectForm({ clientId, onCreated }) {
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
    <form
      onSubmit={onSubmit}
      className="bg-white border border-blue-100
        rounded-xl p-6"
    >
      <h2 className="font-medium mb-4">
        Create the first project for this client
      </h2>
      <input
        required
        placeholder="Project name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full mb-3 px-3 py-2 border
          border-gray-300 rounded-lg text-sm"
      />
      <input
        type="number"
        placeholder="Budget (€)"
        value={budget}
        onChange={(e) => setBudget(e.target.value)}
        className="w-full mb-3 px-3 py-2 border
          border-gray-300 rounded-lg text-sm"
      />
      <input
        type="date"
        value={deadline}
        onChange={(e) => setDeadline(e.target.value)}
        className="w-full mb-4 px-3 py-2 border
          border-gray-300 rounded-lg text-sm"
      />
      <button
        className="bg-blue-600 text-white px-4 py-2
        rounded-lg text-sm font-medium"
      >
        Create project
      </button>
    </form>
  );
}
