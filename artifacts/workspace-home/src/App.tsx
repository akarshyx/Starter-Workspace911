import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, Show, SignIn, SignUp, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  getGetTelegramGiftsQueryKey,
  getGetTelegramStatusQueryKey,
  useGetTelegramGifts,
  useGetTelegramStatus,
  useSendTelegramGift,
  type TelegramGift,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  ArrowDownRight,
  ArrowRight,
  Check,
  CheckCheck,
  CircleHelp,
  CirclePlus,
  Folder,
  Leaf,
  ListTodo,
  LockKeyhole,
  Plus,
  Search,
  Sparkles,
  X,
  Trash2,
  Pencil,
  Gift,
  Coins,
  ArrowUpRight,
  ShieldCheck,
  RefreshCw,
  Send,
  CircleCheck,
  CircleAlert,
} from 'lucide-react';
import {
  Route,
  Redirect,
  Switch,
  useLocation,
  Link,
  Router as WouterRouter,
} from 'wouter';

type Project = {
  id: string;
  name: string;
  color: string;
};

type Task = {
  id: string;
  title: string;
  projectId: string;
  completed: boolean;
};

type WorkspaceData = {
  projects: Project[];
  tasks: Task[];
  isStarter: boolean;
};

const STORAGE_KEY = 'daymark.workspace.v1';
const PROJECT_COLORS = ['#dce8d4', '#f3e0d4', '#e5e4ce', '#dce6e8', '#ecdfd9'];

function makeStarterData(): WorkspaceData {
  return {
    isStarter: true,
    projects: [
      { id: 'seed-studio', name: 'Field Notes Studio', color: PROJECT_COLORS[0] },
      { id: 'seed-gather', name: 'Gather & Grow', color: PROJECT_COLORS[1] },
      { id: 'seed-personal', name: 'A little personal', color: PROJECT_COLORS[2] },
    ],
    tasks: [
      { id: 'seed-task-1', title: 'Sketch the first-run welcome screen', projectId: 'seed-studio', completed: false },
      { id: 'seed-task-2', title: 'Choose three stories for the next issue', projectId: 'seed-studio', completed: false },
      { id: 'seed-task-3', title: 'Send the Saturday market invite', projectId: 'seed-gather', completed: false },
      { id: 'seed-task-4', title: 'Pick up a fresh notebook', projectId: 'seed-personal', completed: false },
      { id: 'seed-task-5', title: 'Gather notes from last week', projectId: 'seed-studio', completed: true },
    ],
  };
}

function readWorkspace(): WorkspaceData {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const value: unknown = JSON.parse(saved);
      if (
        typeof value === 'object' &&
        value !== null &&
        'projects' in value &&
        'tasks' in value &&
        Array.isArray(value.projects) &&
        Array.isArray(value.tasks)
      ) {
        return {
          projects: value.projects as Project[],
          tasks: value.tasks as Task[],
          isStarter: 'isStarter' in value && value.isStarter === true,
        };
      }
    }
  } catch {
    // A damaged or blocked local store should never keep the workspace from opening.
  }
  return makeStarterData();
}

function createId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const queryClient = new QueryClient();

function Home() {
  const [workspace, setWorkspace] = useState<WorkspaceData>(readWorkspace);
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'open' | 'all'>('open');
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [taskProjectId, setTaskProjectId] = useState('');
  const [renameProjectId, setRenameProjectId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const projectInputRef = useRef<HTMLInputElement>(null);
  const taskInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
    } catch {
      // Keep the current session usable when browser storage is unavailable.
    }
  }, [workspace]);

  useEffect(() => {
    if (!taskProjectId || !workspace.projects.some((project) => project.id === taskProjectId)) {
      setTaskProjectId(workspace.projects[0]?.id ?? '');
    }
  }, [taskProjectId, workspace.projects]);

  useEffect(() => {
    if (showProjectForm) projectInputRef.current?.focus();
  }, [showProjectForm]);

  const today = useMemo(
    () => new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()),
    [],
  );
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const projectById = useMemo(
    () => new Map(workspace.projects.map((project) => [project.id, project])),
    [workspace.projects],
  );
  const totalOpen = workspace.tasks.filter((task) => !task.completed).length;
  const totalDone = workspace.tasks.length - totalOpen;
  const completion = workspace.tasks.length === 0 ? 0 : Math.round((totalDone / workspace.tasks.length) * 100);

  const matchesSearch = (value: string) => value.toLocaleLowerCase().includes(normalizedSearch);
  const visibleTasks = workspace.tasks.filter((task) => {
    const project = projectById.get(task.projectId);
    const searchMatches =
      !normalizedSearch ||
      matchesSearch(task.title) ||
      matchesSearch(project?.name ?? '');
    return (
      searchMatches &&
      (viewMode === 'all' || !task.completed) &&
      (projectFilter === 'all' || task.projectId === projectFilter)
    );
  });
  const visibleProjects = workspace.projects.filter((project) => {
    if (projectFilter !== 'all' && project.id !== projectFilter) return false;
    if (!normalizedSearch) return true;
    return (
      matchesSearch(project.name) ||
      workspace.tasks.some((task) => task.projectId === project.id && matchesSearch(task.title))
    );
  });

  function addProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = projectName.trim();
    if (!name) return;
    const project: Project = {
      id: createId(),
      name,
      color: PROJECT_COLORS[workspace.projects.length % PROJECT_COLORS.length],
    };
    setWorkspace((current) => ({
      ...current,
      isStarter: false,
      projects: [...current.projects, project],
    }));
    setTaskProjectId(project.id);
    setProjectName('');
    setShowProjectForm(false);
  }

  function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = newTaskTitle.trim();
    if (!title || !taskProjectId) return;
    setWorkspace((current) => ({
      ...current,
      isStarter: false,
      tasks: [...current.tasks, { id: createId(), title, projectId: taskProjectId, completed: false }],
    }));
    setNewTaskTitle('');
    taskInputRef.current?.focus();
  }

  function toggleTask(taskId: string) {
    setWorkspace((current) => ({
      ...current,
      isStarter: false,
      tasks: current.tasks.map((task) =>
        task.id === taskId ? { ...task, completed: !task.completed } : task,
      ),
    }));
  }

  function removeTask(taskId: string) {
    setWorkspace((current) => ({
      ...current,
      isStarter: false,
      tasks: current.tasks.filter((task) => task.id !== taskId),
    }));
  }

  function removeProject(project: Project) {
    if (!window.confirm(`Remove “${project.name}” and its tasks?`)) return;
    setWorkspace((current) => ({
      ...current,
      isStarter: false,
      projects: current.projects.filter((item) => item.id !== project.id),
      tasks: current.tasks.filter((task) => task.projectId !== project.id),
    }));
    if (projectFilter === project.id) setProjectFilter('all');
    if (renameProjectId === project.id) setRenameProjectId(null);
  }

  function saveProjectName(event: FormEvent<HTMLFormElement>, projectId: string) {
    event.preventDefault();
    const name = renameValue.trim();
    if (!name) return;
    setWorkspace((current) => ({
      ...current,
      isStarter: false,
      projects: current.projects.map((project) => project.id === projectId ? { ...project, name } : project),
    }));
    setRenameProjectId(null);
  }

  function clearWorkspace() {
    const message = workspace.isStarter
      ? 'Clear the starter projects and tasks? This only removes the local sample data.'
      : 'Clear all projects and tasks saved in this browser?';
    if (!window.confirm(message)) return;
    setWorkspace({ projects: [], tasks: [], isStarter: false });
    setSearch('');
    setProjectFilter('all');
    setRenameProjectId(null);
    setShowProjectForm(false);
  }

  function beginRename(project: Project) {
    setRenameProjectId(project.id);
    setRenameValue(project.name);
  }

  function showAllWork() {
    setViewMode('all');
    setProjectFilter('all');
  }

  function showToday() {
    setViewMode('open');
    setProjectFilter('all');
  }

  return (
    <div className="workspace">
      <aside className="rail" aria-label="Workspace navigation">
        <div>
          <div className="brand">
            <span className="brand-mark" aria-hidden="true"><Leaf size={18} strokeWidth={2.1} /></span>
            <span className="brand-name">daymark</span>
          </div>
          <p className="brand-note">A little space to make</p>
        </div>

        <div className="rail-divider" />
        <p className="rail-label">Your workspace</p>
        <nav className="rail-nav" aria-label="Work views">
          <button
            className={`rail-link ${viewMode === 'open' && projectFilter === 'all' ? 'active' : ''}`}
            onClick={showToday}
            data-testid="button-view-today"
            aria-current={viewMode === 'open' && projectFilter === 'all' ? 'page' : undefined}
          >
            <span className="rail-icon"><ListTodo size={16} /></span>
            <span>Today</span>
          </button>
          <button
            className={`rail-link ${viewMode === 'all' ? 'active' : ''}`}
            onClick={showAllWork}
            data-testid="button-view-all-work"
            aria-current={viewMode === 'all' ? 'page' : undefined}
          >
            <span className="rail-icon"><Folder size={15} /></span>
            <span>All work</span>
          </button>
          <Link href="/collectibles" className="rail-link rail-collectibles-link" data-testid="link-collectibles">
            <span className="rail-icon"><Gift size={16} /></span>
            <span>Collectibles</span>
          </Link>
        </nav>

        <div className="rail-divider" />
        <div className="rail-label">
          <span>Projects</span>
          <span>{workspace.projects.length}</span>
        </div>
        <div className="rail-projects" data-testid="list-sidebar-projects">
          {workspace.projects.map((project) => (
            <button
              key={project.id}
              className={`rail-project ${projectFilter === project.id ? 'active' : ''}`}
              onClick={() => {
                setProjectFilter(project.id);
                setViewMode('open');
              }}
              data-testid={`button-filter-project-${project.id}`}
              aria-pressed={projectFilter === project.id}
              title={`Show tasks for ${project.name}`}
            >
              <span className="project-dot" style={{ '--dot': project.color } as CSSProperties} />
              <span className="rail-project-name">{project.name}</span>
            </button>
          ))}
        </div>
        <button
          className="rail-add"
          onClick={() => setShowProjectForm(true)}
          data-testid="button-add-project-sidebar"
        >
          <CirclePlus size={15} />
          <span>New project</span>
        </button>

        <div className="rail-bottom">
          <div className="local-note">
            <div className="local-note-title"><LockKeyhole size={13} /> Just for this browser</div>
            <p>Your projects live in local storage. Nothing is sent or synced elsewhere.</p>
          </div>
          <button className="rail-clear" onClick={clearWorkspace} data-testid="button-clear-workspace">
            {workspace.isStarter ? 'Clear starter set' : 'Clear all work'}
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="crumb" data-testid="text-current-view">
            <span>Workspace</span>
            <ArrowRight size={12} />
              <strong>{projectFilter === 'all' ? (viewMode === 'open' ? 'Today' : 'All work') : projectById.get(projectFilter)?.name}</strong>
          </div>
          <div className="topbar-right">
            <span className="local-status"><span className="status-dot" /> Saved on this device</span>
            <label className="search-wrap">
              <Search size={15} aria-hidden="true" />
              <span className="sr-only">Search projects and tasks</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Find something..."
                data-testid="input-search"
              />
              {search && (
                <button
                  type="button"
                  className="search-clear"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  data-testid="button-clear-search"
                >
                  <X size={13} />
                </button>
              )}
            </label>
          </div>
        </header>

        <section className="welcome" aria-labelledby="welcome-title">
          <div className="eyebrow"><span className="eyebrow-line" />{today}</div>
          <h1 id="welcome-title">{greeting},<br />let’s make <em>some room.</em></h1>
          <p className="welcome-copy">A calm place to gather your projects and <strong>choose what comes next.</strong></p>
        </section>

        <section className="overview" aria-label="Today's progress" data-testid="panel-daily-progress">
          <div className="overview-copy">
            <div className="overview-kicker"><Sparkles size={13} /> A fresh page</div>
            <h2>{totalOpen === 0 ? 'Room to begin.' : `${totalOpen} ${totalOpen === 1 ? 'next step' : 'next steps'}.`}</h2>
            <p>{totalOpen === 0 ? 'Add a project, then give it one small next step.' : 'Pick one thing. The rest can wait.'}</p>
          </div>
          <div className="overview-progress">
            <div className="progress-ring" style={{ '--progress': `${completion}%` } as CSSProperties}>
              <span>{completion}%</span>
            </div>
            <div className="progress-label">
              <strong>{totalDone} of {workspace.tasks.length} done</strong>
              A little progress
            </div>
          </div>
        </section>

        <div className="content-grid">
          <section className="section-panel task-panel" aria-labelledby="tasks-heading">
            <div className="section-heading">
              <div>
                <div className="section-title-row">
                  <span className="section-icon"><ListTodo size={15} /></span>
                  <h2 id="tasks-heading">{viewMode === 'open' ? 'Next actions' : 'All tasks'}</h2>
                  <span className="count-pill" data-testid="text-visible-task-count">{visibleTasks.length}</span>
                </div>
                <p className="section-subtitle">{viewMode === 'open' ? 'Small steps, in no particular order' : 'Every loose end and little win'}</p>
              </div>
              <div className="task-filters">
                <label className="sr-only" htmlFor="project-filter">Filter by project</label>
                <select
                  id="project-filter"
                  className="filter-select"
                  value={projectFilter}
                  onChange={(event) => setProjectFilter(event.target.value)}
                  data-testid="select-project-filter"
                >
                  <option value="all">All projects</option>
                  {workspace.projects.map((project) => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="task-list" data-testid="list-tasks">
              {visibleTasks.map((task) => {
                const project = projectById.get(task.projectId);
                return (
                  <article className="task-row" key={task.id} data-testid={`row-task-${task.id}`}>
                    <button
                      className={`task-check ${task.completed ? 'done' : ''}`}
                      onClick={() => toggleTask(task.id)}
                      aria-label={task.completed ? `Mark ${task.title} as open` : `Complete ${task.title}`}
                      aria-pressed={task.completed}
                      data-testid={`button-complete-task-${task.id}`}
                    >
                      <Check size={13} strokeWidth={2.7} />
                    </button>
                    <div className="task-copy">
                      <span className={`task-title ${task.completed ? 'completed' : ''}`} data-testid={`text-task-title-${task.id}`}>{task.title}</span>
                      {project && (
                        <span className="task-project-label">
                          <span className="project-dot" style={{ '--dot': project.color } as CSSProperties} />
                          {project.name}
                        </span>
                      )}
                    </div>
                    <button
                      className="icon-button"
                      onClick={() => removeTask(task.id)}
                      aria-label={`Remove ${task.title}`}
                      title="Remove task"
                      data-testid={`button-remove-task-${task.id}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </article>
                );
              })}
              {visibleTasks.length === 0 && (
                <div className="empty-state" data-testid="status-no-tasks">
                  <span className="empty-orbit"><CheckCheck size={19} /></span>
                  <div>
                    <h3>{normalizedSearch ? 'Nothing found just yet.' : viewMode === 'open' ? 'A clear little runway.' : 'No tasks here yet.'}</h3>
                    <p>
                      {normalizedSearch
                        ? 'Try another word, or clear your search to see everything.'
                        : workspace.projects.length === 0
                          ? 'Make a project first, then add the first small step.'
                          : viewMode === 'open'
                            ? 'You’ve reached the end of today’s list. Add a next step whenever you’re ready.'
                            : 'Give one of your projects a small next step.'}
                    </p>
                    {normalizedSearch && (
                      <button className="empty-action" onClick={() => setSearch('')} data-testid="button-empty-clear-search">
                        <X size={13} /> Clear search
                      </button>
                    )}
                    {!normalizedSearch && workspace.projects.length === 0 && (
                      <button className="empty-action" onClick={() => setShowProjectForm(true)} data-testid="button-empty-create-project">
                        <Plus size={13} /> Make a project
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {workspace.projects.length > 0 && (
              <form className="task-add-form" onSubmit={addTask} data-testid="form-add-task">
                <Plus size={15} aria-hidden="true" />
                <label className="sr-only" htmlFor="new-task-title">Add a task</label>
                <input
                  id="new-task-title"
                  ref={taskInputRef}
                  value={newTaskTitle}
                  onChange={(event) => setNewTaskTitle(event.target.value)}
                  placeholder="Add a small next step..."
                  data-testid="input-new-task"
                />
                <label className="sr-only" htmlFor="new-task-project">Choose a project</label>
                <select
                  id="new-task-project"
                  value={taskProjectId}
                  onChange={(event) => setTaskProjectId(event.target.value)}
                  data-testid="select-task-project"
                >
                  {workspace.projects.map((project) => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </select>
                <button className="add-submit" type="submit" disabled={!newTaskTitle.trim()} aria-label="Add task" data-testid="button-submit-task">
                  <ArrowDownRight size={15} />
                </button>
              </form>
            )}
          </section>

          <section className="section-panel project-panel" aria-labelledby="projects-heading">
            <div className="section-heading project-heading">
              <div>
                <div className="section-title-row">
                  <span className="section-icon project-section-icon"><Folder size={15} /></span>
                  <h2 id="projects-heading">In progress</h2>
                  <span className="count-pill" data-testid="text-visible-project-count">{visibleProjects.length}</span>
                </div>
                <p className="section-subtitle">Ideas with a place to land</p>
              </div>
              <button
                className="project-add-trigger"
                onClick={() => setShowProjectForm((open) => !open)}
                data-testid="button-add-project"
                aria-expanded={showProjectForm}
              >
                {showProjectForm ? <X size={13} /> : <Plus size={13} />}
                {showProjectForm ? 'Close' : 'Add'}
              </button>
            </div>

            {showProjectForm && (
              <form className="project-form" onSubmit={addProject} data-testid="form-add-project">
                <label className="sr-only" htmlFor="new-project-name">Project name</label>
                <input
                  id="new-project-name"
                  ref={projectInputRef}
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  placeholder="What are you working on?"
                  maxLength={60}
                  data-testid="input-new-project"
                />
                <button type="submit" disabled={!projectName.trim()} aria-label="Save project" data-testid="button-submit-project">
                  <Check size={16} />
                </button>
              </form>
            )}

            <div className="project-list" data-testid="list-projects">
              {visibleProjects.map((project, index) => {
                const projectTasks = workspace.tasks.filter((task) => task.projectId === project.id);
                const openCount = projectTasks.filter((task) => !task.completed).length;
                const isRenaming = renameProjectId === project.id;
                return (
                  <article
                    className="project-card"
                    key={project.id}
                    style={{ animationDelay: `${index * 35}ms`, '--project-tint': project.color } as CSSProperties}
                    data-testid={`card-project-${project.id}`}
                  >
                    <div className="project-card-head">
                      <span className="project-card-mark" aria-hidden="true">{project.name.slice(0, 1).toLocaleUpperCase()}</span>
                      {isRenaming ? (
                        <form className="inline-rename" onSubmit={(event) => saveProjectName(event, project.id)}>
                          <label className="sr-only" htmlFor={`rename-${project.id}`}>Rename {project.name}</label>
                          <input
                            id={`rename-${project.id}`}
                            value={renameValue}
                            onChange={(event) => setRenameValue(event.target.value)}
                            maxLength={60}
                            autoFocus
                            data-testid={`input-rename-project-${project.id}`}
                          />
                          <button type="submit" aria-label="Save project name" data-testid={`button-save-project-${project.id}`}><Check size={13} /></button>
                          <button type="button" className="cancel-rename" aria-label="Cancel rename" onClick={() => setRenameProjectId(null)} data-testid={`button-cancel-rename-${project.id}`}><X size={13} /></button>
                        </form>
                      ) : (
                        <>
                          <span className="project-card-name" title={project.name} data-testid={`text-project-name-${project.id}`}>{project.name}</span>
                          <div className="project-actions">
                            <button className="icon-button" onClick={() => beginRename(project)} aria-label={`Rename ${project.name}`} title="Rename project" data-testid={`button-rename-project-${project.id}`}>
                              <Pencil size={13} />
                            </button>
                            <button className="icon-button" onClick={() => removeProject(project)} aria-label={`Remove ${project.name}`} title="Remove project" data-testid={`button-remove-project-${project.id}`}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                    <div className="project-meta">
                      <span>{openCount} {openCount === 1 ? 'open step' : 'open steps'}</span>
                      <button
                        className="project-view"
                        onClick={() => {
                          setProjectFilter(project.id);
                          setViewMode('open');
                        }}
                        data-testid={`button-view-project-${project.id}`}
                      >
                        See next steps <ArrowRight size={11} />
                      </button>
                    </div>
                  </article>
                );
              })}
              {visibleProjects.length === 0 && (
                <div className="empty-state" data-testid="status-no-projects">
                  <span className="empty-orbit"><Folder size={18} /></span>
                  <div>
                    <h3>{normalizedSearch ? 'No projects match.' : 'Start with a blank page.'}</h3>
                    <p>
                      {normalizedSearch
                        ? 'Try another search, or clear it to see your projects.'
                        : 'Give an idea a name. You can sort out the rest as you go.'}
                    </p>
                    {normalizedSearch ? (
                      <button className="empty-action" onClick={() => setSearch('')} data-testid="button-projects-clear-search">
                        <X size={13} /> Clear search
                      </button>
                    ) : (
                      <button className="empty-action" onClick={() => setShowProjectForm(true)} data-testid="button-empty-add-project">
                        <Plus size={13} /> Add a project
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        {workspace.isStarter && (
          <p className="starter-banner" data-testid="status-starter-data">
            <CircleHelp size={13} />
            <span><strong>A few examples to get you going.</strong> Edit, remove, or clear the starter set any time.</span>
          </p>
        )}
      </main>
    </div>
  );
}

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#355646',
    colorForeground: '#2b3f35',
    colorMutedForeground: '#748078',
    colorDanger: '#bd5545',
    colorBackground: '#f8f6ef',
    colorInput: '#fbfaf4',
    colorInputForeground: '#2b3f35',
    colorNeutral: '#d9d8cc',
    fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
    borderRadius: '0.8rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#f8f6ef] rounded-2xl w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#2b3f35] font-semibold',
    headerSubtitle: 'text-[#748078]',
    socialButtonsBlockButtonText: 'text-[#2b3f35] font-medium',
    formFieldLabel: 'text-[#405448] font-medium',
    footerActionLink: 'text-[#355646] font-semibold',
    footerActionText: 'text-[#748078]',
    dividerText: 'text-[#748078]',
    identityPreviewEditButton: 'text-[#355646]',
    formFieldSuccessText: 'text-[#355646]',
    alertText: 'text-[#8e4138]',
    logoBox: 'rounded-xl',
    logoImage: 'object-contain',
    socialButtonsBlockButton: 'border-[#deddd2] bg-[#fbfaf4] hover:bg-[#f1efe5]',
    formButtonPrimary: 'bg-[#355646] hover:bg-[#284638] text-[#f8f6ef]',
    formFieldInput: 'border-[#deddd2] bg-[#fbfaf4] text-[#2b3f35]',
    footerAction: 'text-[#748078]',
    dividerLine: 'bg-[#e1ded3]',
    alert: 'border-[#e7c5ba] bg-[#fbf0eb]',
    otpCodeFieldInput: 'border-[#deddd2] bg-[#fbfaf4] text-[#2b3f35]',
    formFieldRow: 'gap-2',
    main: 'gap-5',
  },
};

function Landing() {
  return (
    <main className="landing-page">
      <header className="landing-header">
        <Link href="/" className="brand landing-brand">
          <span className="brand-mark" aria-hidden="true"><Leaf size={18} strokeWidth={2.1} /></span>
          <span className="brand-name">daymark</span>
        </Link>
        <nav className="landing-nav" aria-label="Account navigation">
          <Link href="/sign-in" className="landing-signin">Sign in</Link>
          <Link href="/sign-up" className="landing-cta">Make your space <ArrowUpRight size={15} /></Link>
        </nav>
      </header>
      <section className="landing-hero">
        <div className="landing-orbit landing-orbit-one" />
        <div className="landing-orbit landing-orbit-two" />
        <div className="landing-copy">
          <div className="eyebrow"><span className="eyebrow-line" />A workspace for one</div>
          <h1>Make room<br />for <em>what matters.</em></h1>
          <p>Daymark is a small, steady place for your projects, next steps, and the ideas you don’t want to lose.</p>
          <div className="landing-actions">
            <Link href="/sign-up" className="landing-cta landing-cta-large">Start with a blank page <ArrowUpRight size={16} /></Link>
            <Link href="/sign-in" className="landing-text-link">I already have a space <ArrowRight size={14} /></Link>
          </div>
          <div className="landing-footnote"><LockKeyhole size={13} /> Your work stays yours. Projects are saved in this browser.</div>
        </div>
        <div className="landing-scene" aria-hidden="true">
          <div className="scene-sheet">
            <div className="scene-top"><span>MONDAY, 09:14</span><span className="scene-dot" /></div>
            <h2>Today, gently.</h2>
            <p>A little room to think clearly.</p>
            <div className="scene-task"><span className="scene-check" /> Make the first thing real</div>
            <div className="scene-task"><span className="scene-check" /> Send a note to Mira</div>
            <div className="scene-progress"><span /></div>
            <div className="scene-bottom"><span>ONE SMALL STEP</span><span>01 / 03</span></div>
          </div>
          <div className="scene-stamp">A softer<br />way forward</div>
        </div>
      </section>
      <section className="landing-ribbon" aria-label="Daymark principles">
        <div><span>01</span><strong>One person, one clear space</strong></div>
        <div><span>02</span><strong>Small steps still count</strong></div>
        <div><span>03</span><strong>Keep your pace your own</strong></div>
      </section>
      <section className="landing-detail">
        <div className="detail-mark"><ListTodo size={20} /></div>
        <div><p className="detail-kicker">A place to come back to</p><h2>Less managing your tools.<br /><em>More making your thing.</em></h2></div>
        <p className="detail-copy">Keep the projects you care about close, break the next move into something kind-sized, and let the rest wait without guilt.</p>
        <Link href="/sign-up" className="detail-link">Create your workspace <ArrowRight size={14} /></Link>
      </section>
      <footer className="landing-footer"><span>daymark</span><span>A little space to make.</span></footer>
    </main>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in"><Redirect to="/user-portal" /></Show>
      <Show when="signed-out"><Landing /></Show>
    </>
  );
}

function ProtectedWorkspace() {
  return (
    <>
      <Show when="signed-in"><Home /></Show>
      <Show when="signed-out"><Redirect to="/" /></Show>
    </>
  );
}

function safeTelegramError(error: unknown) {
  if (typeof error === 'object' && error !== null) {
    const data = 'data' in error ? error.data : error;
    if (typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string') {
      return data.error.replace(/(?:\d{6,}:[A-Za-z0-9_-]{20,})/g, '[redacted]').slice(0, 220);
    }
  }
  return 'Telegram could not complete that request. Please try again.';
}

function GiftPicker() {
  const statusQuery = useGetTelegramStatus();
  const giftsQuery = useGetTelegramGifts();
  const mutation = useSendTelegramGift();
  const queryClient = useQueryClient();
  const [recipientId, setRecipientId] = useState('');
  const [selectedGiftId, setSelectedGiftId] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const gifts = giftsQuery.data?.gifts ?? [];
  const status = statusQuery.data;
  const recommendation = useMemo(() => {
    const balance = status?.starBalance ?? -1;
    return gifts
      .filter((gift) => gift.upgradeable && gift.totalCost <= balance && (gift.remainingCount === null || gift.remainingCount > 0))
      .sort((a, b) => a.totalCost - b.totalCost)[0];
  }, [gifts, status?.starBalance]);
  const selectedGift = gifts.find((gift) => gift.id === selectedGiftId) ?? recommendation;
  const parsedRecipientId = Number(recipientId);
  const validRecipient = Number.isSafeInteger(parsedRecipientId) && parsedRecipientId > 0;
  const isCollectibleReady = (gift: TelegramGift) => gift.upgradeable;
  const affordable = !!selectedGift && isCollectibleReady(selectedGift) && !!status && selectedGift.totalCost <= status.starBalance;

  function retryAll() {
    void statusQuery.refetch();
    void giftsQuery.refetch();
  }

  function sendApprovedGift() {
    if (!selectedGift || !validRecipient || !affordable || mutation.isPending) return;
    mutation.mutate(
      { data: { giftId: selectedGift.id, recipientId: parsedRecipientId, approved: true } },
      {
        onSuccess: (response) => {
          setSuccessMessage(`Gift sent. ${response.starsSpent} Stars used; the balance is refreshing.`);
          setReviewOpen(false);
          setRecipientId('');
          void queryClient.invalidateQueries({ queryKey: getGetTelegramStatusQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getGetTelegramGiftsQueryKey() });
        },
      },
    );
  }

  const loading = statusQuery.isLoading || giftsQuery.isLoading;
  const queryError = statusQuery.error || giftsQuery.error;

  return (
    <div className="collectibles-page">
      <aside className="rail collectibles-rail" aria-label="Workspace navigation">
        <div>
          <Link href="/user-portal" className="brand">
            <span className="brand-mark" aria-hidden="true"><Leaf size={18} strokeWidth={2.1} /></span>
            <span className="brand-name">daymark</span>
          </Link>
          <p className="brand-note">A little space to make</p>
        </div>
        <div className="rail-divider" />
        <p className="rail-label">Your workspace</p>
        <nav className="rail-nav" aria-label="Workspace">
          <Link href="/user-portal" className="rail-link" data-testid="link-workspace"><span className="rail-icon"><ListTodo size={16} /></span><span>Workspace</span></Link>
          <Link href="/collectibles" className="rail-link active" aria-current="page" data-testid="link-collectibles-current"><span className="rail-icon"><Gift size={16} /></span><span>Collectibles</span></Link>
        </nav>
        <div className="rail-bottom">
          <div className="local-note"><div className="local-note-title"><ShieldCheck size={13} /> Deliberate by design</div><p>Every gift is reviewed before it is sent. Nothing happens from a selection alone.</p></div>
        </div>
      </aside>
      <main className="collectibles-main">
        <header className="collectibles-topbar">
          <div className="crumb"><Link href="/user-portal">Workspace</Link><ArrowRight size={12} /><strong>Collectibles</strong></div>
          <Link href="/user-portal" className="back-workspace"><ArrowRight size={14} /> Back to workspace</Link>
        </header>
        <section className="collectibles-intro">
          <div className="eyebrow"><span className="eyebrow-line" />Telegram gifts</div>
          <h1>Send something<br /><em>worth keeping.</em></h1>
          <p>Compare the live catalog, check the bot’s Star balance, then approve one collectible gift for its recipient.</p>
        </section>

        {loading ? (
          <section className="telegram-skeleton" aria-label="Loading Telegram account">
            <div className="skeleton-block balance-skeleton" /><div className="skeleton-block catalog-skeleton" />
            <span className="sr-only">Loading Telegram status and gift catalog</span>
          </section>
        ) : queryError ? (
          <section className="telegram-error" role="alert">
            <CircleAlert size={19} /><div><h2>Telegram data is unavailable</h2><p>{safeTelegramError(statusQuery.error ?? giftsQuery.error)}</p><button className="retry-button" onClick={retryAll}><RefreshCw size={14} /> Try again</button></div>
          </section>
        ) : (
          <>
            <section className="telegram-account">
              <div className="account-identity">
                <span className="account-mark"><Send size={17} /></span>
                <div><p>Connected Telegram bot</p><h2>{status?.botName ?? 'Telegram bot'}</h2><span>@{status?.botUsername}</span></div>
              </div>
              <div className="balance-block"><span>Available balance</span><strong data-testid="text-star-balance">{status?.starBalance.toLocaleString() ?? '—'}</strong><small><Coins size={13} /> Stars</small></div>
              <button className="refresh-button" onClick={retryAll} aria-label="Refresh Telegram data" data-testid="button-refresh-telegram"><RefreshCw size={15} /></button>
            </section>
            <div className="picker-layout">
              <section className="catalog-column" aria-labelledby="catalog-title">
                <div className="catalog-heading"><div><p className="section-overline">Live Telegram catalog</p><h2 id="catalog-title">Available gifts <span>{gifts.length}</span></h2></div><span className="live-indicator"><i /> Live data</span></div>
                {recommendation && (
                  <div className="recommendation-banner">
                    <span className="recommendation-icon"><CircleCheck size={16} /></span>
                    <div><strong>A thoughtful pick</strong><p>We recommend the lowest-cost upgradeable gift within your current balance.</p></div>
                    <button onClick={() => setSelectedGiftId(recommendation.id)} data-testid="button-use-recommendation">Choose this</button>
                  </div>
                )}
                {gifts.length ? (
                  <div className="gift-grid" data-testid="list-telegram-gifts">
                    {gifts.map((gift) => (
                      <GiftCard
                        key={gift.id}
                        gift={gift}
                        balance={status?.starBalance ?? 0}
                        selected={selectedGift?.id === gift.id}
                        recommended={recommendation?.id === gift.id}
                        onSelect={() => { setSelectedGiftId(gift.id); setSuccessMessage(''); setReviewOpen(false); }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="gift-empty"><Gift size={20} /><h3>No gifts in the live catalog</h3><p>Refresh in a moment to check whether Telegram has added any.</p></div>
                )}
              </section>
              <aside className="send-panel" aria-labelledby="send-title">
                <div className="send-panel-heading"><span className="send-step">01</span><div><p className="section-overline">Prepare a gift</p><h2 id="send-title">Recipient &amp; review</h2></div></div>
                <label className="recipient-label" htmlFor="telegram-recipient">Telegram recipient ID</label>
                <input id="telegram-recipient" className="recipient-input" type="number" min="1" step="1" inputMode="numeric" placeholder="For example, 284901726" value={recipientId} onChange={(event) => { setRecipientId(event.target.value); setSuccessMessage(''); }} data-testid="input-recipient-id" />
                <p className="field-note">Use the numeric ID for the person receiving the gift.</p>
                <div className="selected-summary">
                  <span className="summary-label">Selected gift</span>
                  {selectedGift ? (
                    <div className="summary-gift">
                      <GiftArtwork gift={selectedGift} large />
                      <div><strong>{giftTitle(selectedGift)}</strong><span>Collectible upgrade</span></div>
                    </div>
                  ) : <p className="summary-empty">Choose an available gift from the catalog.</p>}
                  {selectedGift && <div className="cost-lines"><span>Gift cost <strong>{selectedGift.starCost} Stars</strong></span><span>Collectible upgrade <strong>{selectedGift.upgradeCost ?? 0} Stars</strong></span><span className="cost-total">Total <strong>{selectedGift.totalCost} Stars</strong></span></div>}
                </div>
                {!affordable && selectedGift && <p className="balance-warning"><CircleAlert size={14} /> This gift exceeds the available Star balance.</p>}
                <button className="review-button" onClick={() => { setReviewOpen(true); setSuccessMessage(''); }} disabled={!selectedGift || !validRecipient || !affordable || mutation.isPending} data-testid="button-review-gift">
                  Review gift details <ArrowRight size={15} />
                </button>
                <div className="trust-note"><ShieldCheck size={15} /><p>Review first. Telegram receives nothing until you explicitly approve the final send.</p></div>
                {successMessage && <div className="success-message" role="status"><CircleCheck size={16} /><span>{successMessage}</span></div>}
                {mutation.error && <div className="mutation-error" role="alert"><CircleAlert size={15} />{safeTelegramError(mutation.error)}</div>}
              </aside>
            </div>
          </>
        )}
        {reviewOpen && selectedGift && (
          <div className="review-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReviewOpen(false); }}>
            <section className="review-dialog" role="dialog" aria-modal="true" aria-labelledby="review-dialog-title">
              <button className="review-close" aria-label="Close review" onClick={() => setReviewOpen(false)}><X size={17} /></button>
              <span className="review-emblem"><ShieldCheck size={20} /></span>
              <p className="section-overline">Final confirmation</p>
              <h2 id="review-dialog-title">Approve this gift?</h2>
              <p className="review-copy">You are about to send a collectible gift to recipient <strong>{recipientId}</strong>.</p>
              <div className="review-gift-card"><GiftArtwork gift={selectedGift} large /><div><strong>{giftTitle(selectedGift)}</strong><span>{selectedGift.totalCost} Stars total</span></div></div>
              <p className="review-disclaimer">This action sends the gift through Telegram and cannot be undone.</p>
              <button className="approve-button" onClick={sendApprovedGift} disabled={mutation.isPending} data-testid="button-approve-send">
                {mutation.isPending ? 'Sending gift…' : 'Approve & send gift'} <ArrowUpRight size={15} />
              </button>
              <button className="cancel-review" onClick={() => setReviewOpen(false)} disabled={mutation.isPending}>Not yet, go back</button>
              {mutation.error && <p className="review-error" role="alert">{safeTelegramError(mutation.error)}</p>}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function giftTitle(gift: TelegramGift) {
  return gift.emoji ? `Telegram gift ${gift.id}` : `Gift ${gift.id}`;
}

function GiftArtwork({ gift, large = false }: { gift: TelegramGift; large?: boolean }) {
  return (
    <span className={`gift-art ${large ? 'gift-art-large' : ''}`} aria-label={gift.emoji ? 'Telegram gift artwork' : undefined}>
      {gift.emoji || <Gift size={large ? 23 : 20} />}
    </span>
  );
}

function GiftCard({ gift, balance, selected, recommended, onSelect }: { gift: TelegramGift; balance: number; selected: boolean; recommended: boolean; onSelect: () => void }) {
  const available = gift.remainingCount === null || gift.remainingCount > 0;
  const upgradeable = gift.upgradeable;
  const affordable = gift.totalCost <= balance;
  return (
    <button
      className={`gift-card ${selected ? 'selected' : ''} ${!available || !affordable || !upgradeable ? 'unavailable' : ''}`}
      onClick={onSelect}
      disabled={!available || !upgradeable}
      aria-pressed={selected}
      data-testid={`card-gift-${gift.id}`}
    >
      <span className="gift-card-top"><GiftArtwork gift={gift} /><span className={`gift-selection ${selected ? 'checked' : ''}`}>{selected && <Check size={12} />}</span></span>
      <strong className="gift-card-name">{giftTitle(gift)}</strong>
      <span className="gift-card-cost"><Coins size={12} /> {gift.totalCost} Stars</span>
      <span className="gift-card-meta">{upgradeable ? `Upgrade +${gift.upgradeCost} Stars` : 'Not upgradeable'}</span>
      <span className="gift-card-stock">{gift.remainingCount === null ? 'Availability not limited' : `${gift.remainingCount.toLocaleString()} of ${gift.totalCount?.toLocaleString() ?? '—'} remaining`}</span>
      {recommended && <span className="gift-recommended">Recommended</span>}
      {!affordable && <span className="gift-unaffordable">Over balance</span>}
    </button>
  );
}

function TelegramRoute() {
  return (
    <>
      <Show when="signed-in"><GiftPicker /></Show>
      <Show when="signed-out"><Redirect to="/" /></Show>
    </>
  );
}

function SignInPage() {
  return <main className="auth-page"><div className="auth-shell"><Link href="/" className="auth-back"><ArrowRight size={14} /> Back to Daymark</Link><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div></main>;
}

function SignUpPage() {
  return <main className="auth-page"><div className="auth-shell"><Link href="/" className="auth-back"><ArrowRight size={14} /> Back to Daymark</Link><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div></main>;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const nextId = user?.id ?? null;
      if (previousUserId.current !== undefined && previousUserId.current !== nextId) client.clear();
      previousUserId.current = nextId;
    });
    return unsubscribe;
  }, [addListener, client]);
  return null;
}

function ClerkRoutes() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to return to your space' } },
        signUp: { start: { title: 'Make a little space', subtitle: 'Create your personal Daymark workspace' } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <ClerkQueryClientCacheInvalidator />
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/user-portal" component={ProtectedWorkspace} />
          <Route path="/collectibles" component={TelegramRoute} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </ClerkProvider>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in environment.');
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={basePath}>
          <ClerkRoutes />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;