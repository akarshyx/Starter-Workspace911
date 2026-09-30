import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
} from 'lucide-react';
import {
  Route,
  Switch,
  useLocation,
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

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;