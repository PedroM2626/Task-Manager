import { useState, useEffect, useRef } from "react";
import { db, auth, provider, storage, storageRef, uploadBytes, getDownloadURL, deleteObject, signInWithPopup, signOut } from "./firebaseConfig";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  query,
  where,
} from "firebase/firestore";
import { motion } from "framer-motion";
import ReactQuill from "react-quill";
import 'react-quill/dist/quill.snow.css';
import DOMPurify from 'dompurify';

// Sanitiza textos vindos de inputs e do banco, removendo marcações HTML
function decodeEntities(html) {
  if (typeof window === 'undefined') return html;
  const el = document.createElement('textarea');
  el.innerHTML = html;
  return el.value;
}

function sanitizeMultilineText(raw) {
  if (!raw) return "";
  let text = String(raw);
  // Normaliza quebras de linha vindas de tags comuns
  text = text.replace(/<\s*br\s*\/?\s*>/gi, "\n");
  text = text.replace(/<\s*\/p\s*>/gi, "\n");
  // Remove o restante das tags
  text = text.replace(/<[^>]+>/g, "");
  // Evita espaços excessivos preservando quebras
  text = text.replace(/[\t\r]+/g, "");
  // Decodifica entidades HTML como &nbsp;
  text = decodeEntities(text);
  return text;
}

// Função para salvar a posição do cursor em um elemento contentEditable
function saveSelection(containerEl) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  let preSelectionRange = range.cloneRange();
  preSelectionRange.selectNodeContents(containerEl);
  preSelectionRange.setEnd(range.startContainer, range.startOffset);
  const start = preSelectionRange.toString().length;
  return { start, end: start + range.toString().length };
}

// Função para restaurar a posição do cursor e o scroll do container
function restoreSelection(containerEl, savedSel) {
  if (!savedSel) return;
  const savedScrollTop = containerEl.scrollTop;
  let charIndex = 0;
  const range = document.createRange();
  range.setStart(containerEl, 0);
  range.collapse(true);
  const nodeStack = [containerEl];
  let node, foundStart = false, stop = false;
  while (!stop && (node = nodeStack.pop())) {
    if (node.nodeType === 3) {
      let nextCharIndex = charIndex + node.length;
      if (!foundStart && savedSel.start >= charIndex && savedSel.start <= nextCharIndex) {
        range.setStart(node, savedSel.start - charIndex);
        foundStart = true;
      }
      if (foundStart && savedSel.end >= charIndex && savedSel.end <= nextCharIndex) {
        range.setEnd(node, savedSel.end - charIndex);
        stop = true;
      }
      charIndex = nextCharIndex;
    } else {
      let i = node.childNodes.length;
      while (i--) {
        nodeStack.push(node.childNodes[i]);
      }
    }
  }
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  containerEl.scrollTop = savedScrollTop;
}

// Array de fontes pré-definidas
const predefinedFonts = ["Arial", "Helvetica", "Times New Roman", "Courier New", "Verdana", "Sans", "Calibri", "Futura", "Roboto", "Open Sans", "Garamond"];

function TaskManager() {
  // Helper function to generate unique IDs
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // Estados para criação de tarefas
  const [tasks, setTasks] = useState([]);
  const [newTaskPriority, setNewTaskPriority] = useState(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskTitleTextColor, setNewTaskTitleTextColor] = useState("#ffffff");
  const [newTaskTitleFont, setNewTaskTitleFont] = useState("Arial");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [newTaskDescColor, setNewTaskDescColor] = useState("#000000");
  const [newTaskDescFont, setNewTaskDescFont] = useState("Arial");
  const [newTaskDescFontSize, setNewTaskDescFontSize] = useState("14");
  const [newTaskAreaColor, setNewTaskAreaColor] = useState("#808080");
  const [newTaskPriorityLabel, setNewTaskPriorityLabel] = useState(null); // low | medium | high | urgent
  const [newTaskStartDate, setNewTaskStartDate] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [newTaskFiles, setNewTaskFiles] = useState([]);
  const [newTaskTags, setNewTaskTags] = useState([]);

  // Estados para edição in place da tarefa
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editingPriority, setEditingPriority] = useState(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingTitleTextColor, setEditingTitleTextColor] = useState("#ffffff");
  const [editingTitleFont, setEditingTitleFont] = useState("Arial");
  const [editingDescription, setEditingDescription] = useState("");
  const [editingDescColor, setEditingDescColor] = useState("#000000");
  const [editingDescFont, setEditingDescFont] = useState("Arial");
  const [editingDescFontSize, setEditingDescFontSize] = useState("14");
  const [editingTaskTags, setEditingTaskTags] = useState([]);
  const [editingTagInput, setEditingTagInput] = useState("");
  const [editingAreaColor, setEditingAreaColor] = useState("");
  const [editingPriorityLabel, setEditingPriorityLabel] = useState(null);
  const [editingStartDate, setEditingStartDate] = useState("");
  const [editingDueDate, setEditingDueDate] = useState("");
  const [editingFiles, setEditingFiles] = useState([]);

  // Estados para tags globais
  const [availableTags, setAvailableTags] = useState([]);
  const [newTag, setNewTag] = useState("");
  const [newTagColor, setNewTagColor] = useState("#cccccc");
  const [newTagTextColor, setNewTagTextColor] = useState("#000000");
  const [editingTag, setEditingTag] = useState(null);
  const [editTagName, setEditTagName] = useState("");
  const [editTagColor, setEditTagColor] = useState("");
  const [editTagTextColor, setEditTagTextColor] = useState("");

  // Estados para gerenciamento de tags na visualização
  const [tagEditingTaskId, setTagEditingTaskId] = useState(null);
  const [tagEditingInput, setTagEditingInput] = useState("");

  // Estado para o usuário
  const [user, setUser] = useState(null);

  // Inputs de subtarefas por tarefa
  const [subtaskInputsByTaskId, setSubtaskInputsByTaskId] = useState({});
  
  // Estados para edição de subtarefas
  const [editingSubtask, setEditingSubtask] = useState(null);
  const [editingSubtaskTitle, setEditingSubtaskTitle] = useState('');

  // Filtros e busca
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // all | open | done
  const [tagFilter, setTagFilter] = useState("");
  const [sortKey, setSortKey] = useState("priority"); // priority | createdAt | updatedAt | progress | title
  const [sortDir, setSortDir] = useState("asc"); // asc | desc
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [viewMode, setViewMode] = useState("list"); // list | board
  const [toasts, setToasts] = useState([]);

  // Preferências por usuário (salvas em localStorage)
  const PREFS_KEY = (uid) => `tm_prefs_${uid}`;
  function loadPreferencesForUser(uid) {
    try {
      const raw = localStorage.getItem(PREFS_KEY(uid));
      if (!raw) return;
      const prefs = JSON.parse(raw);
      if (typeof prefs.searchTerm === 'string') setSearchTerm(prefs.searchTerm);
      if (typeof prefs.statusFilter === 'string') setStatusFilter(prefs.statusFilter);
      if (typeof prefs.tagFilter === 'string') setTagFilter(prefs.tagFilter);
      if (typeof prefs.sortKey === 'string') setSortKey(prefs.sortKey);
      if (typeof prefs.sortDir === 'string') setSortDir(prefs.sortDir);
    } catch (_) { /* ignore */ }
  }

  // Refs para os elementos contentEditable na edição
  const editingPriorityRef = useRef(null);
  const editingTitleRef = useRef(null);
  const editingDescriptionRef = useRef(null);

  useEffect(() => {
    auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        loadPreferencesForUser(currentUser.uid);
        loadTasks(currentUser.uid);
        loadTags(currentUser.uid);
      } else {
        setTasks([]);
        setAvailableTags([]);
      }
    });
  }, []);

  // Persistência automática das preferências
  useEffect(() => {
    if (!user) return;
    const prefs = {
      searchTerm,
      statusFilter,
      tagFilter,
      sortKey,
      sortDir,
    };
    try { localStorage.setItem(PREFS_KEY(user.uid), JSON.stringify(prefs)); } catch (_) { /* ignore */ }
  }, [user, searchTerm, statusFilter, tagFilter, sortKey, sortDir]);

  async function loadTasks(userId) {
    const q = query(collection(db, "tasks"), where("userId", "==", userId));
    const querySnapshot = await getDocs(q);
    const tasksList = querySnapshot.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        title: sanitizeMultilineText(data.title),
        description: typeof data.description === 'string' ? data.description : "",
        subtasks: Array.isArray(data.subtasks) ? data.subtasks.map((s) => ({
          id: s.id || generateId(),
          title: sanitizeMultilineText(s.title),
          completed: !!s.completed,
        })) : [],
        createdAt: data.createdAt || Date.now(),
        updatedAt: data.updatedAt || Date.now(),
        priorityLabel: data.priorityLabel || null,
        startDate: data.startDate || '',
        dueDate: data.dueDate || '',
        attachments: Array.isArray(data.attachments) ? data.attachments : [],
      };
    });
    const effectiveSort = (task) =>
      task.priority && parseInt(task.priority) >= 1 ? parseInt(task.priority) : Infinity;
    setTasks(tasksList.sort((a, b) => effectiveSort(a) - effectiveSort(b)));
  }

  async function loadTags(userId) {
    const q = query(collection(db, "tags"), where("userId", "==", userId));
    const querySnapshot = await getDocs(q);
    const tagsList = querySnapshot.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        name: data.name,
        color: data.color,
        textColor: data.textColor,
        userId: data.userId,
        createdAt: data.createdAt || Date.now(),
      };
    });
    setAvailableTags(tagsList);
  }

  const [isLoggingIn, setIsLoggingIn] = useState(false);

  async function login() {
    if (isLoggingIn) return; // Prevent multiple clicks
    
    setIsLoggingIn(true);
    addToast('Iniciando autenticação...', 'info');
    
    try {
      // Add a small delay to ensure any previous state is cleared
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Open popup and wait for result
      console.log('Initiating Google sign-in...');
      const result = await signInWithPopup(auth, provider);
      
      if (!result?.user) {
        throw new Error('No user returned from authentication');
      }
      
      console.log('Authentication successful, user:', result.user.uid);
      
      // Update user state
      setUser(result.user);
      
      // Load user-specific data
        try {
          await Promise.all([
            loadTasks(result.user.uid),
            loadTags(result.user.uid),
            loadPreferencesForUser(result.user.uid)
          ]);
          addToast('Login realizado com sucesso!', 'success');
        } catch (loadError) {
          console.error('Error loading user data:', loadError);
          addToast('Login realizado, mas houve um erro ao carregar os dados do usuário.', 'warning');
        }
      
    } catch (error) {
      console.error('Authentication error:', error);
      
      // Handle specific error cases
      switch (error.code) {
        case 'auth/popup-closed-by-user':
          addToast('O popup de login foi fechado. Por favor, tente novamente.', 'warning');
          break;
        case 'auth/cancelled-popup-request':
          console.log('Login popup was cancelled (likely multiple clicks)');
          break;
        case 'auth/popup-blocked':
          addToast(
            'O popup de login foi bloqueado. ' +
            'Por favor, permita popups para este site e tente novamente.',
            'error'
          );
          break;
        case 'auth/unauthorized-domain':
          addToast(
            'Domínio não autorizado. ' +
            'Por favor, entre em contato com o suporte do sistema.',
            'error'
          );
          break;
        case 'auth/network-request-failed':
          addToast(
            'Erro de conexão. ' +
            'Por favor, verifique sua conexão com a internet e tente novamente.',
            'error'
          );
          break;
        default:
          addToast(
            `Erro ao fazer login: ${error.message || 'Tente novamente mais tarde.'}`,
            'error'
          );
      }
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function logout() {
    try {
      await signOut(auth);
      setUser(null);
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
      alert('Erro ao fazer logout. Por favor, tente novamente.');
    }
  }

  function getPriorityColor(priority) {
    switch (parseInt(priority)) {
      case 1:
        return "#ff0000";
      case 2:
        return "#ff7f00";
      case 3:
        return "#ffff00";
      case 4:
        return "#00ff00";
      case 5:
        return "#0000ff";
      default:
        return "#ffffff";
    }
  }

  // Função auxiliar para alternar a centralização (ciclo: left -> center -> right -> left)
  function cycleAlignment(current) {
    if (current === "left") return "center";
    if (current === "center") return "right";
    return "left";
  }

  function toggleTitleAlignment(taskId) {
    setTasks(
      tasks.map((task) => {
        if (task.id === taskId) {
          const newAlign = cycleAlignment(task.textAlignTitle || "center");
          return { ...task, textAlignTitle: newAlign };
        }
        return task;
      })
    );
  }

  function toggleDescAlignment(taskId) {
    setTasks(
      tasks.map((task) => {
        if (task.id === taskId) {
          const newAlign = cycleAlignment(task.textAlignDescription || "center");
          return { ...task, textAlignDescription: newAlign };
        }
        return task;
      })
    );
  }

  async function addTask() {
    if (newTaskTitle.trim() === "" || !user) return;
    const now = Date.now();
    const taskData = {
      priority: newTaskPriority ? parseInt(newTaskPriority) : null,
      title: sanitizeMultilineText(newTaskTitle),
      titleTextColor: newTaskTitleTextColor,
      titleFont: newTaskTitleFont,
      // Armazenamos HTML sanitizado para preservar formatação
      description: DOMPurify.sanitize(newTaskDescription || ""),
      descriptionColor: newTaskDescColor,
      descriptionFont: newTaskDescFont,
      descriptionFontSize: newTaskDescFontSize,
      areaColor: newTaskAreaColor,
      completed: false,
      userId: user.uid,
      tags: newTaskTags,
      subtasks: [],
      textAlignTitle: "center",
      textAlignDescription: "center",
      createdAt: now,
      updatedAt: now,
      priorityLabel: newTaskPriorityLabel,
      startDate: newTaskStartDate,
      dueDate: newTaskDueDate,
      attachments: [],
    };
    const docRef = await addDoc(collection(db, "tasks"), taskData);
    setTasks(
      [...tasks, { id: docRef.id, ...taskData }].sort(
        (a, b) =>
          (a.priority && parseInt(a.priority) >= 1 ? parseInt(a.priority) : Infinity) -
          (b.priority && parseInt(b.priority) >= 1 ? parseInt(b.priority) : Infinity)
      )
    );
    setNewTaskTags([]); // Reset tags after creating task
    addToast('Tarefa criada com sucesso', 'success');
  }

  async function toggleTask(id, completed) {
    // Se a tarefa tiver subtarefas, ao marcar/desmarcar, espelhar em todas
    const current = tasks.find((t) => t.id === id);
    const newCompleted = !completed;
    const newSubtasks = Array.isArray(current?.subtasks)
      ? current.subtasks.map((s) => ({ ...s, completed: newCompleted }))
      : [];
    const taskRef = doc(db, "tasks", id);
    await updateDoc(taskRef, { completed: newCompleted, subtasks: newSubtasks, updatedAt: Date.now() });
    setTasks(
      tasks.map((task) => (task.id === id ? { ...task, completed: newCompleted, subtasks: newSubtasks, updatedAt: Date.now() } : task))
    );
    addToast(newCompleted ? 'Tarefa concluída' : 'Tarefa reaberta', 'info');
  }

  async function deleteTask(id) {
    await deleteDoc(doc(db, "tasks", id));
    setTasks(tasks.filter((task) => task.id !== id));
    addToast('Tarefa excluída', 'warning');
  }

  function startEditing(task) {
    setEditingTaskId(task.id);
    setEditingPriority(task.priority);
    setEditingTitle(task.title);
    setEditingTitleTextColor(task.titleTextColor);
    setEditingTitleFont(task.titleFont || "Arial");
    setEditingDescription(task.description);
    setEditingDescColor(task.descriptionColor || "#000000");
    setEditingDescFont(task.descriptionFont || "Arial");
    setEditingDescFontSize(task.descriptionFontSize || "14");
    setEditingTaskTags(task.tags || []);
    setEditingAreaColor(task.areaColor || "#808080");
    setEditingTagInput("");
  }

  async function saveEditing() {
    if (editingTitle.trim() === "" || !editingTaskId) return;
    const updatedData = {
      priority: editingPriority ? parseInt(editingPriority) : null,
      title: sanitizeMultilineText(editingTitle),
      titleTextColor: editingTitleTextColor,
      titleFont: editingTitleFont,
      description: DOMPurify.sanitize(editingDescription || ""),
      descriptionColor: editingDescColor,
      descriptionFont: editingDescFont,
      descriptionFontSize: editingDescFontSize,
      tags: editingTaskTags,
      areaColor: editingAreaColor,
      updatedAt: Date.now(),
      priorityLabel: editingPriorityLabel,
      startDate: editingStartDate,
      dueDate: editingDueDate,
      attachments: editingFiles,
    };
    const taskRef = doc(db, "tasks", editingTaskId);
    await updateDoc(taskRef, updatedData);
    setTasks(
      tasks.map((task) =>
        task.id === editingTaskId ? { ...task, ...updatedData } : task
      )
    );
    cancelEditing();
  }

  function cancelEditing() {
    setEditingTaskId(null);
    setEditingPriority(null);
    setEditingTitle("");
    setEditingTitleTextColor("");
    setEditingTitleFont("Arial");
    setEditingDescription("");
    setEditingDescColor("#000000");
    setEditingDescFont("Arial");
    setEditingDescFontSize("14");
    setEditingTaskTags([]);
    setEditingTagInput("");
    setEditingAreaColor("");
  }

  // ---------- Subtarefas ----------
  function getSubtaskCounts(task) {
    const total = Array.isArray(task.subtasks) ? task.subtasks.length : 0;
    const done = total > 0 ? task.subtasks.filter((s) => s.completed).length : 0;
    return { done, total };
  }

  async function addSubtask(taskId) {
    const title = sanitizeMultilineText(subtaskInputsByTaskId[taskId] || "");
    if (!title.trim()) return;
    const task = tasks.find((t) => t.id === taskId);
    const newSubtask = { id: generateId(), title, completed: false };
    const updatedSubtasks = [...(task.subtasks || []), newSubtask];
    const taskRef = doc(db, "tasks", taskId);
    await updateDoc(taskRef, { subtasks: updatedSubtasks, updatedAt: Date.now() });
    setTasks(tasks.map((t) => (t.id === taskId ? { ...t, subtasks: updatedSubtasks, updatedAt: Date.now() } : t)));
    setSubtaskInputsByTaskId({ ...subtaskInputsByTaskId, [taskId]: "" });
  }

  async function toggleSubtask(taskId, subtaskId) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const updatedSubtasks = (task.subtasks || []).map((s) =>
      s.id === subtaskId ? { ...s, completed: !s.completed } : s
    );
    // Se todas subtarefas estiverem concluídas, marca a tarefa como concluída
    const allDone = updatedSubtasks.length > 0 && updatedSubtasks.every((s) => s.completed);
    const taskRef = doc(db, "tasks", taskId);
    await updateDoc(taskRef, { subtasks: updatedSubtasks, completed: allDone ? true : false, updatedAt: Date.now() });
    setTasks(tasks.map((t) => (t.id === taskId ? { ...t, subtasks: updatedSubtasks, completed: allDone, updatedAt: Date.now() } : t)));
  }
  
  // Iniciar edição de subtarefa
  function startEditingSubtask(taskId, subtask) {
    setEditingSubtask({ taskId, ...subtask });
    setEditingSubtaskTitle(subtask.title);
  }
  
  // Cancelar edição de subtarefa
  function cancelEditingSubtask() {
    setEditingSubtask(null);
    setEditingSubtaskTitle('');
  }
  
  // Salvar edição de subtarefa
  async function saveSubtaskEdit() {
    if (!editingSubtask || !editingSubtaskTitle.trim()) return;
    
    const task = tasks.find(t => t.id === editingSubtask.taskId);
    if (!task) return;
    
    const updatedSubtasks = (task.subtasks || []).map(s => 
      s.id === editingSubtask.id 
        ? { ...s, title: sanitizeMultilineText(editingSubtaskTitle) }
        : s
    );
    
    const taskRef = doc(db, "tasks", editingSubtask.taskId);
    await updateDoc(taskRef, { 
      subtasks: updatedSubtasks, 
      updatedAt: Date.now() 
    });
    
    setTasks(tasks.map(t => 
      t.id === editingSubtask.taskId 
        ? { ...t, subtasks: updatedSubtasks, updatedAt: Date.now() } 
        : t
    ));
    
    cancelEditingSubtask();
  }

  async function removeSubtask(taskId, subtaskId) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const updatedSubtasks = (task.subtasks || []).filter((s) => s.id !== subtaskId);
    const allDone = updatedSubtasks.length > 0 && updatedSubtasks.every((s) => s.completed);
    const taskRef = doc(db, "tasks", taskId);
    await updateDoc(taskRef, { subtasks: updatedSubtasks, completed: allDone, updatedAt: Date.now() });
    setTasks(tasks.map((t) => (t.id === taskId ? { ...t, subtasks: updatedSubtasks, completed: allDone, updatedAt: Date.now() } : t)));
  }

  // Funções para gerenciar tags globalmente
  async function updateTagGlobally(oldTagName, updatedTag) {
    // Encontra a tag no Firestore
    const tagDoc = availableTags.find(tag => tag.name === oldTagName);
    if (!tagDoc || !user) return;

    // Atualiza no Firestore
    const tagRef = doc(db, "tags", tagDoc.id);
    await updateDoc(tagRef, {
      name: updatedTag.name,
      color: updatedTag.color,
      textColor: updatedTag.textColor,
      updatedAt: Date.now(),
    });

    // Atualiza a tag em todas as tarefas
    const updatedTasks = await Promise.all(
      tasks.map(async (task) => {
        if (task.tags && task.tags.some(tag => tag.name === oldTagName)) {
          const updatedTags = task.tags.map(tag => 
            tag.name === oldTagName ? { ...tag, ...updatedTag } : tag
          );
          
          const taskRef = doc(db, "tasks", task.id);
          await updateDoc(taskRef, { 
            tags: updatedTags, 
            updatedAt: Date.now() 
          });
          
          return { ...task, tags: updatedTags, updatedAt: Date.now() };
        }
        return task;
      })
    );
    
    setTasks(updatedTasks);
    addToast(`Tag "${oldTagName}" atualizada em todas as tarefas`, "success");
  }

  async function deleteTagGlobally(tagName) {
    // Encontra a tag no Firestore
    const tagDoc = availableTags.find(tag => tag.name === tagName);
    if (!tagDoc || !user) return;

    // Remove do Firestore
    const tagRef = doc(db, "tags", tagDoc.id);
    await deleteDoc(tagRef);

    // Remove a tag de todas as tarefas
    const updatedTasks = await Promise.all(
      tasks.map(async (task) => {
        if (task.tags && task.tags.some(tag => tag.name === tagName)) {
          const updatedTags = task.tags.filter(tag => tag.name !== tagName);
          
          const taskRef = doc(db, "tasks", task.id);
          await updateDoc(taskRef, { 
            tags: updatedTags, 
            updatedAt: Date.now() 
          });
          
          return { ...task, tags: updatedTags, updatedAt: Date.now() };
        }
        return task;
      })
    );
    
    setTasks(updatedTasks);
    addToast(`Tag "${tagName}" removida de todas as tarefas`, "warning");
  }

  function startEditTag(tag) {
    setEditingTag(tag);
    setEditTagName(tag.name);
    setEditTagColor(tag.color);
    setEditTagTextColor(tag.textColor);
  }

  function cancelEditTag() {
    setEditingTag(null);
    setEditTagName("");
    setEditTagColor("");
    setEditTagTextColor("");
  }

  async function saveEditTag() {
    if (!editTagName.trim()) {
      addToast("Nome da tag não pode estar vazio", "error");
      return;
    }

    if (editingTag.name !== editTagName && availableTags.some(tag => tag.name === editTagName)) {
      addToast("Já existe uma tag com esse nome", "error");
      return;
    }

    const updatedTag = {
      name: editTagName.trim(),
      color: editTagColor,
      textColor: editTagTextColor
    };

    await updateTagGlobally(editingTag.name, updatedTag);
    cancelEditTag();
  }

  function getProgressPercent(task) {
    const { done, total } = getSubtaskCounts(task);
    return total > 0 ? (done / total) * 100 : 0;
  }

  function getDueStatus(task) {
    if (!task.dueDate) return 'none';
    const now = new Date();
    const due = new Date(task.dueDate);
    const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'overdue';
    if (diffDays <= 2) return 'soon';
    return 'ok';
  }

  function addToast(message, variant = 'info') {
    // Use a more compatible method to generate unique IDs
    const id = generateId();
    setToasts((t) => [...t, { id, message, variant }]);
    const timer = setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 3500);
    
    // Return a function to clear the timeout if needed
    return () => clearTimeout(timer);
  }

  // Marcar todas subtarefas / limpar concluídas
  async function setAllSubtasksCompletion(taskId, completed) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const updatedSubtasks = (task.subtasks || []).map((s) => ({ ...s, completed }));
    const taskRef = doc(db, "tasks", taskId);
    await updateDoc(taskRef, { subtasks: updatedSubtasks, completed, updatedAt: Date.now() });
    setTasks(tasks.map((t) => (t.id === taskId ? { ...t, subtasks: updatedSubtasks, completed, updatedAt: Date.now() } : t)));
  }

  async function clearCompletedSubtasks(taskId) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const updatedSubtasks = (task.subtasks || []).filter((s) => !s.completed);
    const allDone = updatedSubtasks.length > 0 && updatedSubtasks.every((s) => s.completed);
    const taskRef = doc(db, "tasks", taskId);
    await updateDoc(taskRef, { subtasks: updatedSubtasks, completed: allDone, updatedAt: Date.now() });
    setTasks(tasks.map((t) => (t.id === taskId ? { ...t, subtasks: updatedSubtasks, completed: allDone, updatedAt: Date.now() } : t)));
  }

  // Exportar/Importar tarefas
  const importInputRef = useRef(null);

  function triggerImport() {
    if (importInputRef.current) importInputRef.current.click();
  }

  async function handleImportFileChange(e) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const items = Array.isArray(data) ? data : [];
      const now = Date.now();
      for (const item of items) {
        const payload = {
          title: sanitizeMultilineText(item.title || ""),
          description: typeof item.description === 'string' ? DOMPurify.sanitize(item.description) : "",
          userId: user.uid,
          priority: item.priority ?? null,
          completed: !!item.completed,
          tags: Array.isArray(item.tags) ? item.tags : [],
          subtasks: Array.isArray(item.subtasks) ? item.subtasks.map((s) => ({ id: s.id || generateId(), title: sanitizeMultilineText(s.title || ''), completed: !!s.completed })) : [],
          titleTextColor: item.titleTextColor || '#ffffff',
          titleFont: item.titleFont || 'Arial',
          descriptionColor: item.descriptionColor || '#000000',
          descriptionFont: item.descriptionFont || 'Arial',
          descriptionFontSize: item.descriptionFontSize || '14',
          areaColor: item.areaColor || '#808080',
          textAlignTitle: item.textAlignTitle || 'center',
          textAlignDescription: item.textAlignDescription || 'center',
          createdAt: item.createdAt || now,
          updatedAt: now,
        };
        await addDoc(collection(db, 'tasks'), payload);
      }
      await loadTasks(user.uid);
      alert('Importação concluída.');
    } catch (err) {
      console.error(err);
      alert('Falha ao importar JSON.');
    } finally {
      e.target.value = '';
    }
  }

  function exportTasks() {
    const toExport = tasks.map((t) => ({ ...t }));
    const blob = new Blob([JSON.stringify(toExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tasks-export-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function removeTagFromEditing(tagName) {
    setEditingTaskTags(editingTaskTags.filter((t) => t.name !== tagName));
  }

  // Atualiza as tags de uma tarefa no Firestore e no estado
  async function updateTaskTags(taskId, newTags) {
    try {
      const taskRef = doc(db, "tasks", taskId);
      await updateDoc(taskRef, { 
        tags: newTags,
        updatedAt: Date.now() 
      });
      
      setTasks(tasks.map((task) => 
        task.id === taskId 
          ? { ...task, tags: newTags, updatedAt: Date.now() } 
          : task
      ));
    } catch (error) {
      console.error("Error updating tags:", error);
      addToast("Erro ao atualizar as tags da tarefa", "error");
    }
  }

  // Função para adicionar tag via input (digitada) na área de gerenciamento de tags da visualização
  async function handleAddEditingTag(taskId) {
    if (!tagEditingInput.trim()) return;
    
    // Verifica se a tag já existe nas tags globais
    const existingTag = availableTags.find(
      (t) => t.name.toLowerCase() === tagEditingInput.trim().toLowerCase()
    );
    
    let tagToAdd = existingTag || { 
      name: tagEditingInput.trim(), 
      bgColor: "#cccccc", 
      textColor: "#000000" 
    };

    // Adiciona a tag global se não existir
    if (!existingTag) {
      setAvailableTags(prev => [...prev, tagToAdd]);
    }
    
    // Adiciona a tag à tarefa
    const task = tasks.find((t) => t.id === taskId);
    if (task) {
      const tagExists = task.tags?.some(
        t => t.name.toLowerCase() === tagToAdd.name.toLowerCase()
      );
      
      if (!tagExists) {
        const newTags = [...(task.tags || []), tagToAdd];
        await updateTaskTags(taskId, newTags);
      }
    }
    
    setTagEditingInput("");
  }

  // Função para adicionar tag via seleção de uma tag global existente
  async function handleSelectTag(taskId, tagName) {
    const globalTag = availableTags.find(
      (t) => t.name.toLowerCase() === tagName.toLowerCase()
    );
    if (!globalTag) return;
    
    const task = tasks.find((t) => t.id === taskId);
    if (task) {
      const tagExists = (task.tags || []).some(
        t => t.name.toLowerCase() === tagName.toLowerCase()
      );
      
      if (!tagExists) {
        const newTags = [...(task.tags || []), globalTag];
        await updateTaskTags(taskId, newTags);
      }
    }
  }

  // Função para remover tag na área de gerenciamento de tags da visualização
  async function handleRemoveTag(taskId, tagName) {
    const task = tasks.find((t) => t.id === taskId);
    if (task) {
      const newTags = (task.tags || []).filter(
        (t) => t.name.toLowerCase() !== tagName.toLowerCase()
      );
      await updateTaskTags(taskId, newTags);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4 flex flex-col">
      {/* Modal de Edição de Subtarefa */}
      {editingSubtask && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-white mb-4">Editar Subtarefa</h3>
            <input
              type="text"
              value={editingSubtaskTitle}
              onChange={(e) => setEditingSubtaskTitle(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-slate-700 text-white border border-slate-600 mb-4"
              onKeyDown={(e) => e.key === 'Enter' && saveSubtaskEdit()}
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={cancelEditingSubtask}
                className="px-4 py-2 rounded-lg bg-slate-600 text-white hover:bg-slate-500 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={saveSubtaskEdit}
                className="px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-500 transition-colors"
                disabled={!editingSubtaskTitle.trim()}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Edição de Tag */}
      {editingTag && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-white mb-4">Editar Tag</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Nome da Tag</label>
                <input
                  type="text"
                  value={editTagName}
                  onChange={(e) => setEditTagName(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg bg-slate-700 text-white border border-slate-600"
                  autoFocus
                />
              </div>
              
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-300 mb-2">Cor de Fundo</label>
                  <input
                    type="color"
                    value={editTagColor}
                    onChange={(e) => setEditTagColor(e.target.value)}
                    className="w-full h-10 rounded-lg border border-slate-600 cursor-pointer"
                  />
                </div>
                
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-300 mb-2">Cor do Texto</label>
                  <input
                    type="color"
                    value={editTagTextColor}
                    onChange={(e) => setEditTagTextColor(e.target.value)}
                    className="w-full h-10 rounded-lg border border-slate-600 cursor-pointer"
                  />
                </div>
              </div>
              
              <div className="flex items-center justify-center">
                <span
                  className="px-4 py-2 rounded-full text-sm font-medium"
                  style={{
                    backgroundColor: editTagColor,
                    color: editTagTextColor,
                  }}
                >
                  {editTagName || 'Pré-visualização'}
                </span>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={cancelEditTag}
                className="px-4 py-2 rounded-lg bg-slate-600 text-white hover:bg-slate-500 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={saveEditTag}
                className="px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-500 transition-colors"
                disabled={!editTagName.trim()}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className="max-w-4xl mx-auto w-full">
        {/* Cabeçalho */}
        <motion.div 
          className="text-center mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-6xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-6">
            ✨ Task Manager ✨
          </h1>
          {user && (
            <motion.button 
              onClick={logout} 
              className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white px-6 py-3 rounded-xl font-semibold shadow-lg transition-all duration-200"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              🚪 Sair
            </motion.button>
          )}
        </motion.div>

        {/* Toasts */}
        <div className="fixed top-4 right-4 z-50 space-y-2">
          {toasts.map((t) => (
            <div key={t.id} className={`px-4 py-2 rounded shadow text-white ${t.variant === 'success' ? 'bg-emerald-600' : t.variant === 'warning' ? 'bg-amber-600' : 'bg-indigo-600'}`}>{t.message}</div>
          ))}
        </div>

        {!user ? (
          <div
            className="flex items-center justify-center w-full force-center"
            style={{
              minHeight: "70vh",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              textAlign: "center"
            }}
          >
            <motion.div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                width: "100%",
                maxWidth: "500px",
                margin: "0 auto"
              }}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
            >
              <div
                className="p-12 rounded-3xl backdrop-blur-xl bg-white/10 border border-white/20 shadow-2xl"
                style={{ textAlign: "center", width: "100%" }}
              >
                <h2
                  className="text-3xl font-semibold text-white mb-6"
                  style={{ textAlign: "center", margin: "0 auto 1.5rem auto" }}
                >
                  Bem-vindo!
                </h2>
                <p
                  className="text-gray-300 mb-8"
                  style={{ textAlign: "center", margin: "0 auto 2rem auto" }}
                >
                  Faça login para gerenciar suas tarefas
                </p>
                <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
                  <motion.button
                    onClick={login}
                    disabled={isLoggingIn}
                    className={`bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white px-8 py-4 rounded-xl font-semibold text-lg shadow-lg transition-all duration-200 ${isLoggingIn ? 'opacity-75 cursor-not-allowed' : ''}`}
                    style={{ margin: "0 auto", textAlign: "center" }}
                    whileHover={!isLoggingIn ? { scale: 1.05 } : {}}
                    whileTap={!isLoggingIn ? { scale: 0.95 } : {}}
                  >
                    {isLoggingIn ? (
                      <span className="flex items-center justify-center">
                        <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Carregando...
                      </span>
                    ) : (
                      '🔑 Login com Google'
                    )}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </div>
        ) : (
          <>
            {/* Nova Tarefa */}
            <motion.div 
              className="p-6 rounded-3xl backdrop-blur-xl bg-white/10 border border-white/20 shadow-2xl mb-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white">✨ Nova Tarefa</h2>
                <div className="flex items-center gap-2">
                  <button className={`px-3 py-2 rounded-lg text-sm ${viewMode === 'list' ? 'bg-white/20' : 'bg-white/10'} border border-white/20 text-white`} onClick={() => setViewMode('list')}>Lista</button>
                  <button className={`px-3 py-2 rounded-lg text-sm ${viewMode === 'board' ? 'bg-white/20' : 'bg-white/10'} border border-white/20 text-white`} onClick={() => setViewMode('board')}>Kanban</button>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-3 mb-4">
                <input
                  type="number"
                  className="flex-1 min-w-24 px-4 py-3 rounded-xl bg-white/20 border border-white/30 text-white placeholder-gray-300 text-center focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white/30 transition-all duration-200"
                  placeholder="Prioridade"
                  value={newTaskPriority || ""}
                  onChange={(e) => setNewTaskPriority(e.target.value)}
                />
                <input
                  className="flex-1 px-4 py-3 rounded-xl bg-white/20 border border-white/30 text-white placeholder-gray-300 text-center focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white/30 transition-all duration-200"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="Título da tarefa"
                />
                <input
                  type="color"
                  value={newTaskTitleTextColor}
                  onChange={(e) => setNewTaskTitleTextColor(e.target.value)}
                  title="Cor do Texto do Título"
                  className="w-16 h-12 rounded-xl border-2 border-white/30 cursor-pointer hover:border-purple-400 transition-all duration-200"
                />
                <select
                  className="px-4 py-3 rounded-xl bg-white/20 border border-white/30 text-white focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white/30 transition-all duration-200"
                  value={newTaskTitleFont}
                  onChange={(e) => setNewTaskTitleFont(e.target.value)}
                >
                  {predefinedFonts.map((font) => (
                    <option key={font} value={font} style={{ fontFamily: font, color: 'black' }}>
                      {font}
                    </option>
                  ))}
                </select>
                <select
                  className="flex-1 px-4 py-3 rounded-xl bg-white/20 border border-white/30 text-white focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white/30 transition-all duration-200"
                  value={newTaskPriorityLabel}
                  onChange={(e) => setNewTaskPriorityLabel(e.target.value)}
                >
                  <option value="" style={{ color: 'black' }}>Nenhuma</option>
                  <option value="low" style={{ color: 'black' }}>Low</option>
                  <option value="medium" style={{ color: 'black' }}>Medium</option>
                  <option value="high" style={{ color: 'black' }}>High</option>
                  <option value="urgent" style={{ color: 'black' }}>Urgent</option>
                </select>
              </div>
              
              <div className="flex gap-3 mb-4">
                <textarea
                  className="flex-1 px-4 py-3 rounded-xl bg-white/20 border border-white/30 text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white/30 transition-all duration-200 min-h-24 resize-vertical"
                  value={newTaskDescription}
                  onChange={(e) => setNewTaskDescription(e.target.value)}
                  placeholder="Digite a descrição da tarefa..."
                  style={{ whiteSpace: "pre-wrap" }}
                />
                <div className="flex flex-col gap-3">
                  <input
                    type="color"
                    value={newTaskAreaColor}
                    onChange={(e) => setNewTaskAreaColor(e.target.value)}
                    title="Cor da Área da Lista"
                    className="w-16 h-12 rounded-xl border-2 border-white/30 cursor-pointer hover:border-purple-400 transition-all duration-200"
                  />
                  <input
                    type="color"
                    value={newTaskDescColor}
                    onChange={(e) => setNewTaskDescColor(e.target.value)}
                    title="Cor do Texto da Descrição"
                    className="w-16 h-12 rounded-xl border-2 border-white/30 cursor-pointer hover:border-purple-400 transition-all duration-200"
                  />
                </div>
              </div>
              
              <div className="flex gap-3 mb-6 flex-wrap">
                <select
                  className="flex-1 px-4 py-3 rounded-xl bg-white/20 border border-white/30 text-white focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white/30 transition-all duration-200"
                  value={newTaskDescFont}
                  onChange={(e) => setNewTaskDescFont(e.target.value)}
                >
                  {predefinedFonts.map((font) => (
                    <option key={font} value={font} style={{ fontFamily: font, color: 'black' }}>
                      {font}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  className="flex-1 px-4 py-3 rounded-xl bg-white/20 border border-white/30 text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white/30 transition-all duration-200"
                  placeholder="Tamanho da Fonte (ex: 14)"
                  value={newTaskDescFontSize}
                  onChange={(e) => setNewTaskDescFontSize(e.target.value)}
                />
                <input
                  type="date"
                  className="px-4 py-3 rounded-xl bg-white/20 border border-white/30 text-white focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white/30 transition-all duration-200"
                  value={newTaskStartDate}
                  onChange={(e) => setNewTaskStartDate(e.target.value)}
                  title="Data de início"
                />
                <input
                  type="date"
                  className="px-4 py-3 rounded-xl bg-white/20 border border-white/30 text-white focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white/30 transition-all duration-200"
                  value={newTaskDueDate}
                  onChange={(e) => setNewTaskDueDate(e.target.value)}
                  title="Prazo final"
                />
                <input
                  type="file"
                  multiple
                  className="px-4 py-3 rounded-xl bg-white/20 border border-white/30 text-white focus:outline-none"
                  onChange={(e) => setNewTaskFiles(Array.from(e.target.files || []))}
                  title="Anexos"
                />
              </div>

              {/* Seleção de Tags para Nova Tarefa */}
              {availableTags.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-white text-sm font-semibold mb-3">🏷️ Tags da Tarefa:</h3>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {availableTags.map((tag) => (
                      <motion.button
                        key={tag.name}
                        type="button"
                        className={`px-3 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                          newTaskTags.some(t => t.name === tag.name)
                            ? 'ring-2 ring-white scale-110'
                            : 'hover:scale-105'
                        }`}
                        style={{
                          backgroundColor: tag.bgColor,
                          color: tag.textColor,
                        }}
                        onClick={() => {
                          if (newTaskTags.some(t => t.name === tag.name)) {
                            setNewTaskTags(newTaskTags.filter(t => t.name !== tag.name));
                          } else {
                            setNewTaskTags([...newTaskTags, tag]);
                          }
                        }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        {tag.name}
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}
              
              <motion.button 
                onClick={addTask} 
                className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white px-6 py-4 rounded-xl font-semibold text-lg shadow-lg transition-all duration-200"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                ➕ Adicionar Tarefa
              </motion.button>
            </motion.div>

            {/* Filtros e busca */}
            <motion.div 
              className="p-4 rounded-2xl backdrop-blur-xl bg-white/10 border border-white/20 shadow-xl mb-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15 }}
            >
              <div className="flex flex-wrap gap-3 justify-center">
                <input
                  type="text"
                  className="px-4 py-2 rounded-xl bg-white/20 border border-white/30 text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white/30 transition-all duration-200"
                  placeholder="Buscar por título..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <select
                  className="px-4 py-2 rounded-xl bg-white/20 border border-white/30 text-white focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white/30 transition-all duration-200"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all" style={{ color: 'black' }}>Todas</option>
                  <option value="open" style={{ color: 'black' }}>Abertas</option>
                  <option value="done" style={{ color: 'black' }}>Concluídas</option>
                </select>
                <select
                  className="px-4 py-2 rounded-xl bg-white/20 border border-white/30 text-white focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white/30 transition-all duration-200"
                  value={tagFilter}
                  onChange={(e) => setTagFilter(e.target.value)}
                >
                  <option value="" style={{ color: 'black' }}>Todas as tags</option>
                  {availableTags.map((t) => (
                    <option key={t.name} value={t.name} style={{ color: 'black' }}>{t.name}</option>
                  ))}
                </select>
                <select
                  className="px-4 py-2 rounded-xl bg-white/20 border border-white/30 text-white focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white/30 transition-all duration-200"
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value)}
                >
                  <option value="priority" style={{ color: 'black' }}>Ordenar por prioridade</option>
                  <option value="createdAt" style={{ color: 'black' }}>Data de criação</option>
                  <option value="updatedAt" style={{ color: 'black' }}>Última atualização</option>
                  <option value="progress" style={{ color: 'black' }}>Progresso</option>
                  <option value="title" style={{ color: 'black' }}>Título</option>
                </select>
                <select
                  className="px-4 py-2 rounded-xl bg-white/20 border border-white/30 text-white focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white/30 transition-all duration-200"
                  value={sortDir}
                  onChange={(e) => setSortDir(e.target.value)}
                >
                  <option value="asc" style={{ color: 'black' }}>Crescente</option>
                  <option value="desc" style={{ color: 'black' }}>Decrescente</option>
                </select>
                <input
                  type="date"
                  className="px-4 py-2 rounded-xl bg-white/20 border border-white/30 text-white focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white/30 transition-all duration-200"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  title="De (data de início)"
                />
                <input
                  type="date"
                  className="px-4 py-2 rounded-xl bg-white/20 border border-white/30 text-white focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white/30 transition-all duration-200"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  title="Até (prazo)"
                />
              </div>
            </motion.div>

            {/* Ações rápidas: exportar/importar */}
            <motion.div 
              className="p-4 rounded-2xl backdrop-blur-xl bg-white/10 border border-white/20 shadow-xl mb-6 flex flex-wrap gap-3 justify-center"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.18 }}
            >
              <motion.button onClick={exportTasks} className="bg-teal-500 hover:bg-teal-600 text-white px-4 py-2 rounded-lg text-sm" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>⬇️ Exportar JSON</motion.button>
              <input ref={importInputRef} type="file" accept="application/json" onChange={handleImportFileChange} style={{ display: 'none' }} />
              <motion.button onClick={triggerImport} className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>⬆️ Importar JSON</motion.button>
            </motion.div>

            {/* Gerenciar Tags Globais */}
            <motion.div 
              className="p-6 rounded-3xl backdrop-blur-xl bg-white/10 border border-white/20 shadow-2xl mb-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <h2 className="text-2xl font-bold text-center text-white mb-6">🏷️ Gerenciar Tags Globais</h2>
              
              <div className="flex gap-3 mb-4">
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Nome da tag"
                  className="flex-1 px-4 py-3 rounded-xl bg-white/20 border border-white/30 text-white placeholder-gray-300 text-center focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white/30 transition-all duration-200"
                />
                <input
                  type="color"
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                  title="Cor de Fundo da Tag"
                  className="w-16 h-12 rounded-xl border-2 border-white/30 cursor-pointer hover:border-purple-400 transition-all duration-200"
                />
                <input
                  type="color"
                  value={newTagTextColor}
                  onChange={(e) => setNewTagTextColor(e.target.value)}
                  title="Cor do Texto da Tag"
                  className="w-16 h-12 rounded-xl border-2 border-white/30 cursor-pointer hover:border-purple-400 transition-all duration-200"
                />
                <motion.button
                  onClick={async () => {
                    if (newTag.trim() && user) {
                      if (
                        !availableTags.some(
                          (t) => t.name.toLowerCase() === newTag.toLowerCase()
                        )
                      ) {
                        const tagData = {
                          name: newTag.trim(),
                          color: newTagColor,
                          textColor: newTagTextColor,
                          userId: user.uid,
                          createdAt: Date.now(),
                        };
                        await addDoc(collection(db, "tags"), tagData);
                      }
                      setNewTag("");
                      setNewTagColor("#cccccc");
                      setNewTagTextColor("#000000");
                    }
                  }}
                  className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-6 py-3 rounded-xl font-semibold transition-all duration-200"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  + Tag
                </motion.button>
              </div>
              
              <div className="flex flex-wrap justify-center gap-2">
                {availableTags.map((tag) => (
                  <motion.div
                    key={tag.name}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl shadow-lg"
                    style={{
                      backgroundColor: tag.bgColor,
                      color: tag.textColor,
                    }}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                  >
                    {editingTag && editingTag.name === tag.name ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editTagName}
                          onChange={(e) => setEditTagName(e.target.value)}
                          placeholder="Nome"
                          className="px-2 py-1 rounded text-sm bg-white/20 text-white placeholder-white/70 focus:outline-none focus:ring-1 focus:ring-white"
                          style={{ color: tag.textColor }}
                        />
                        <input
                          type="color"
                          value={editTagColor}
                          onChange={(e) => setEditTagColor(e.target.value)}
                          className="w-6 h-6 rounded cursor-pointer border-none"
                          title="Cor de fundo"
                        />
                        <input
                          type="color"
                          value={editTagTextColor}
                          onChange={(e) => setEditTagTextColor(e.target.value)}
                          className="w-6 h-6 rounded cursor-pointer border-none"
                          title="Cor do texto"
                        />
                        <button
                          onClick={saveEditTag}
                          className="bg-green-500 hover:bg-green-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs transition-all duration-200"
                        >
                          ✓
                        </button>
                        <button
                          onClick={cancelEditTag}
                          className="bg-gray-500 hover:bg-gray-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs transition-all duration-200"
                        >
                          ✗
                        </button>
                      </div>
                    ) : (
                      <>
                        <span>{tag.name}</span>
                        <button
                          onClick={() => startEditTag(tag)}
                          className="bg-blue-500 hover:bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs transition-all duration-200"
                          title="Editar tag"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(`Tem certeza que deseja excluir a tag "${tag.name}" de todas as tarefas?`)) {
                              deleteTagGlobally(tag.name);
                            }
                          }}
                          className="bg-red-500 hover:bg-red-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs transition-all duration-200"
                          title="Excluir tag"
                        >
                          ×
                        </button>
                      </>
                    )}
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Listas Criadas | Board/List */}
            <motion.div 
              className="p-6 rounded-3xl backdrop-blur-xl bg-white/10 border border-white/20 shadow-2xl"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              <h2 className="text-2xl font-bold text-center text-white mb-6">📋 Suas Tarefas</h2>

              {viewMode === 'board' ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {['open','doing','done'].map((col) => (
                    <div key={col} className="rounded-2xl p-4 bg-white/10 border border-white/20 min-h-64"
                      onDragOver={(e)=>e.preventDefault()}
                      onDrop={(e)=>{
                        const id = e.dataTransfer.getData('text/plain');
                        const t = tasks.find(x=>x.id===id);
                        if(!t) return;
                        const updated = tasks.map(x => x.id===id ? { ...x, status: col, completed: col==='done' ? true : x.completed } : x);
                        setTasks(updated);
                        const taskRef = doc(db,'tasks',id);
                        updateDoc(taskRef,{ status: col, completed: col==='done', updatedAt: Date.now() });
                        addToast('Tarefa movida', 'info');
                      }}
                    >
                      <div className="text-white font-semibold mb-2">
                        {col === 'open' ? 'Abertas' : col === 'doing' ? 'Em andamento' : 'Concluídas'}
                      </div>
                      {tasks
                        .filter(t=> (col==='open' ? (!t.status || t.status==='open') : t.status===col))
                        .map(t => (
                          <div key={t.id} draggable onDragStart={(e)=>e.dataTransfer.setData('text/plain', t.id)} className="rounded-xl p-3 bg-white/20 border border-white/20 mb-3 cursor-move">
                            <div className="text-white font-semibold mb-1">{t.title}</div>
                            <div className="text-xs text-gray-200">{(() => { const {done,total}=getSubtaskCounts(t); return `${done}/${total}` })()}</div>
                          </div>
                        ))}
                    </div>
                  ))}
                </div>
              ) : (
              <div className="space-y-4">
                {tasks
                  .filter((t) => (statusFilter === 'all' ? true : statusFilter === 'done' ? t.completed : !t.completed))
                  .filter((t) => (searchTerm ? t.title.toLowerCase().includes(searchTerm.toLowerCase()) : true))
                  .filter((t) => (tagFilter ? (t.tags || []).some((tg) => tg.name.toLowerCase() === tagFilter.toLowerCase()) : true))
                  .filter((t) => {
                    if (!dateFrom && !dateTo) return true;
                    const start = t.startDate ? new Date(t.startDate) : null;
                    const due = t.dueDate ? new Date(t.dueDate) : null;
                    const fromOk = dateFrom ? ((start && start >= new Date(dateFrom)) || (due && due >= new Date(dateFrom))) : true;
                    const toOk = dateTo ? ((start && start <= new Date(dateTo)) || (due && due <= new Date(dateTo))) : true;
                    return fromOk && toOk;
                  })
                  .sort((a, b) => {
                    const dir = sortDir === 'asc' ? 1 : -1;
                    switch (sortKey) {
                      case 'priority': {
                        const pa = a.priority ? Number(a.priority) : Number.MAX_SAFE_INTEGER;
                        const pb = b.priority ? Number(b.priority) : Number.MAX_SAFE_INTEGER;
                        return (pa - pb) * dir;
                      }
                      case 'createdAt':
                        return ((a.createdAt || 0) - (b.createdAt || 0)) * dir;
                      case 'updatedAt':
                        return ((a.updatedAt || 0) - (b.updatedAt || 0)) * dir;
                      case 'progress':
                        return (getProgressPercent(a) - getProgressPercent(b)) * dir;
                      case 'title':
                        return a.title.localeCompare(b.title) * dir;
                      default:
                        return 0;
                    }
                  })
                  .map((task, index) => {
                  const areaBg = task.areaColor || "#808080";
                  return (
                    <motion.div
                      key={task.id}
                      style={{ backgroundColor: areaBg }}
                      className={`rounded-2xl p-6 shadow-xl ${task.completed ? "opacity-60" : ""} backdrop-blur-sm`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: task.completed ? 0.6 : 1, y: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.1 }}
                      whileHover={{ scale: 1.02 }}
                    >
                        {/* Barra de progresso das subtarefas */}
                        {(() => { const { done, total } = getSubtaskCounts(task); const pct = total > 0 ? Math.round((done/total)*100) : 0; return (
                          <div className="w-full mb-3">
                            <div className="h-2 rounded bg-white/20 overflow-hidden">
                              <div className="h-2 bg-emerald-500" style={{ width: `${pct}%` }} />
                            </div>
                            <div className="text-xs text-gray-200 mt-1">Progresso: {done}/{total} ({pct}%)</div>
                          </div>
                        )})()}
                      <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-2">
                          {/* Badge de prioridade */}
                          <span className="px-2 py-1 rounded text-xs font-semibold"
                            style={{
                              backgroundColor: (
                                task.priorityLabel === 'urgent' ? '#ef4444' :
                                task.priorityLabel === 'high' ? '#f59e0b' :
                                task.priorityLabel === 'medium' ? '#3b82f6' : '#10b981'
                              ),
                              color: '#fff'
                            }}
                          >
                            {task.priorityLabel?.toUpperCase() || ''}
                          </span>
                          {/* Datas */}
                          {task.startDate && <span className="text-xs text-gray-200">Início: {task.startDate}</span>}
                          {task.dueDate && (
                            <span className="text-xs px-2 py-1 rounded"
                              style={{
                                backgroundColor: (
                                  getDueStatus(task) === 'overdue' ? 'rgba(239,68,68,0.25)' :
                                  getDueStatus(task) === 'soon' ? 'rgba(245,158,11,0.25)' : 'rgba(16,185,129,0.25)'
                                ),
                                color: '#fff'
                              }}
                            >Prazo: {task.dueDate}</span>
                          )}
                        </div>
                        <input
                          type="checkbox"
                          checked={task.completed}
                          onChange={() => toggleTask(task.id, task.completed)}
                          className="w-5 h-5 rounded focus:ring-2 focus:ring-purple-400"
                        />
                      </div>
                      
                      {editingTaskId === task.id ? (
                        <div className="space-y-4">
                          <div className="flex gap-3">
                            <div
                              contentEditable
                              ref={(el) => (editingPriorityRef.current = el)}
                              className="priority-number px-4 py-2 bg-white/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400"
                              onInput={(e) => {
                                const saved = saveSelection(editingPriorityRef.current);
                                setEditingPriority(e.currentTarget.textContent);
                                setTimeout(() => {
                                  restoreSelection(editingPriorityRef.current, saved);
                                }, 0);
                              }}
                              suppressContentEditableWarning={true}
                            >
                              {editingPriority}
                            </div>
                            <div className="flex-1 space-y-3">
                              <div
                                contentEditable
                                ref={(el) => (editingTitleRef.current = el)}
                                className="title-number px-4 py-2 bg-white/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400"
                                onInput={(e) => {
                                  const saved = saveSelection(editingTitleRef.current);
                                  setEditingTitle(e.currentTarget.textContent);
                                  setTimeout(() => {
                                    restoreSelection(editingTitleRef.current, saved);
                                  }, 0);
                                }}
                                suppressContentEditableWarning={true}
                                style={{ whiteSpace: "pre-wrap" }}
                              >
                                {editingTitle}
                              </div>
                              <div className="flex gap-3">
                                <label className="text-white text-sm">Cor:</label>
                                <input
                                  type="color"
                                  className="w-12 h-8 rounded border-2 border-white/30"
                                  value={editingTitleTextColor}
                                  onChange={(e) => setEditingTitleTextColor(e.target.value)}
                                />
                                <select
                                  className="flex-1 px-3 py-1 rounded bg-white/20 border border-white/30 text-white"
                                  value={editingTitleFont}
                                  onChange={(e) => setEditingTitleFont(e.target.value)}
                                >
                                  {predefinedFonts.map((font) => (
                                    <option key={font} value={font} style={{ fontFamily: font, color: 'black' }}>
                                      {font}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  className="flex-1 px-3 py-1 rounded bg-white/20 border border-white/30 text-white"
                                  value={editingPriorityLabel}
                                  onChange={(e) => setEditingPriorityLabel(e.target.value)}
                                >
                                  <option value="" style={{ color: 'black' }}>Nenhuma</option>
                                  <option value="low" style={{ color: 'black' }}>Low</option>
                                  <option value="medium" style={{ color: 'black' }}>Medium</option>
                                  <option value="high" style={{ color: 'black' }}>High</option>
                                  <option value="urgent" style={{ color: 'black' }}>Urgent</option>
                                </select>
                              </div>
                            </div>
                          </div>
                          
                          <div className="text-left">
                            <ReactQuill
                              theme="snow"
                              value={editingDescription}
                              onChange={(val) => setEditingDescription(val)}
                              modules={{
                                toolbar: [
                                  [{ header: [1, 2, 3, false] }],
                                  ['bold', 'italic', 'underline', 'strike'],
                                  [{ list: 'ordered' }, { list: 'bullet' }],
                                  [{ color: [] }, { background: [] }],
                                  ['link', 'clean']
                                ],
                              }}
                            />
                          </div>

                          {/* Gerenciamento de Tags na Edição */}
                          {availableTags.length > 0 && (
                            <div className="space-y-3">
                              <h3 className="text-white text-sm font-semibold">🏷️ Tags da Tarefa:</h3>
                              <div className="flex flex-wrap gap-2 justify-center">
                                {availableTags.map((tag) => (
                                  <motion.button
                                    key={tag.name}
                                    type="button"
                                    className={`px-3 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                                      editingTaskTags.some(t => t.name === tag.name)
                                        ? 'ring-2 ring-white scale-110'
                                        : 'hover:scale-105'
                                    }`}
                                    style={{
                                      backgroundColor: tag.bgColor,
                                      color: tag.textColor,
                                    }}
                                    onClick={() => {
                                      if (editingTaskTags.some(t => t.name === tag.name)) {
                                        setEditingTaskTags(editingTaskTags.filter(t => t.name !== tag.name));
                                      } else {
                                        setEditingTaskTags([...editingTaskTags, tag]);
                                      }
                                    }}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                  >
                                    {tag.name}
                                  </motion.button>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          <div className="flex gap-3 justify-center">
                            <motion.button 
                              onClick={saveEditing} 
                              className="bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded-xl transition-all duration-200"
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              💾 Salvar
                            </motion.button>
                            <motion.button 
                              onClick={cancelEditing} 
                              className="bg-gray-500 hover:bg-gray-600 text-white px-6 py-2 rounded-xl transition-all duration-200"
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              ❌ Cancelar
                            </motion.button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {task.priority && (
                            <div 
                              className="priority-number text-center font-bold text-2xl"
                              style={{ color: getPriorityColor(task.priority) }}
                            >
                              {task.priority}
                            </div>
                          )}
                          
                          <div
                            className={`title-number text-3xl font-bold ${task.completed ? "line-through" : ""}`}
                            style={{
                              color: task.titleTextColor,
                              fontFamily: task.titleFont || "Arial",
                              textAlign: task.textAlignTitle || "center",
                              wordWrap: "break-word",
                            }}
                          >
                            {task.title}
                          </div>
                          
                          <div className={`text-lg ${task.completed ? "line-through" : ""}`} style={{ textAlign: task.textAlignDescription || 'center' }}>
                            <div
                              className="prose prose-invert max-w-none"
                              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(task.description || '') }}
                            />
                          </div>
                          
                          {task.subtasks?.map((subtask) => (
                              <div key={subtask.id} className="flex items-center gap-2 text-sm group">
                                <input
                                  type="checkbox"
                                  checked={subtask.completed}
                                  onChange={() => toggleSubtask(task.id, subtask.id)}
                                  className="rounded text-purple-500 focus:ring-purple-400 flex-shrink-0"
                                />
                                <span 
                                  className={`flex-grow ${subtask.completed ? 'line-through text-gray-400' : 'text-gray-200'} cursor-text`}
                                  onClick={() => startEditingSubtask(task.id, subtask)}
                                >
                                  {subtask.title}
                                </span>
                                <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startEditingSubtask(task.id, subtask);
                                    }}
                                    className="text-gray-400 hover:text-blue-400 p-1"
                                    title="Editar subtarefa"
                                  >
                                    ✏️
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeSubtask(task.id, subtask.id);
                                    }}
                                    className="text-gray-400 hover:text-red-400 p-1"
                                    title="Remover subtarefa"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                            ))}
                          
                          {task.tags && task.tags.length > 0 && (
                            <div className="flex flex-wrap justify-center gap-2">
                              {task.tags.map((tag) => (
                                <div key={tag.name} className="group relative inline-block">
                                  <span
                                    className="px-3 py-1 rounded-full text-sm font-medium cursor-pointer"
                                    style={{
                                      backgroundColor: tag.bgColor,
                                      color: tag.textColor,
                                    }}
                                    title="Clique para editar ou excluir"
                                  >
                                    {tag.name}
                                  </span>
                                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-gray-800 rounded-md shadow-lg p-1 flex gap-1 z-10">
                                    <button
                                      onClick={() => {
                                        setEditingTag(tag);
                                        setEditTagName(tag.name);
                                        setEditTagColor(tag.bgColor);
                                        setEditTagTextColor(tag.textColor);
                                        setSelectedTask(task);
                                      }}
                                      className="p-1 text-blue-400 hover:text-blue-300"
                                      title="Editar tag"
                                    >
                                      ✏️
                                    </button>
                                    <button
                                      onClick={async () => {
                                        if (window.confirm(`Tem certeza que deseja remover a tag "${tag.name}" desta tarefa?`)) {
                                          const updatedTags = task.tags.filter(t => t.name !== tag.name);
                                          await updateTaskTags(task.id, updatedTags);
                                          addToast(`Tag "${tag.name}" removida da tarefa`, "success");
                                        }
                                      }}
                                      className="p-1 text-red-400 hover:text-red-300"
                                      title="Remover tag da tarefa"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          
                          {/* Subtarefas */}
                          <div className="mt-4 space-y-2">
                            <div className="flex items-center justify-center gap-2 flex-wrap">
                              <input
                                type="text"
                                className="px-3 py-2 rounded-lg bg-white/20 border border-white/30 text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white/30 transition-all duration-200"
                                placeholder="Adicionar subtarefa"
                                value={subtaskInputsByTaskId[task.id] || ''}
                                onChange={(e) => setSubtaskInputsByTaskId({ ...subtaskInputsByTaskId, [task.id]: e.target.value })}
                              />
                              <motion.button
                                onClick={() => addSubtask(task.id)}
                                className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm transition-all duration-200"
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                              >
                                + Subtarefa
                              </motion.button>
                              <span className="text-gray-200 text-sm">
                                {(() => { const {done, total} = getSubtaskCounts(task); return `${done}/${total}` })()}
                              </span>
                            </div>
                            <div className="flex flex-col gap-2">
                              {(task.subtasks || []).map((s) => (
                                <div key={s.id} className="flex items-center justify-center gap-2">
                                  <input type="checkbox" className="w-4 h-4" checked={!!s.completed} onChange={() => toggleSubtask(task.id, s.id)} />
                                  <span className={`text-white ${s.completed ? 'line-through text-gray-300' : ''}`}>{s.title}</span>
                                  <button className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs" onClick={() => removeSubtask(task.id, s.id)}>x</button>
                                </div>
                              ))}
                            </div>
                            <div className="flex gap-2 justify-center">
                              <button className="bg-sky-500 hover:bg-sky-600 text-white px-3 py-1 rounded text-xs" onClick={() => setAllSubtasksCompletion(task.id, true)}>Marcar todas</button>
                              <button className="bg-slate-500 hover:bg-slate-600 text-white px-3 py-1 rounded text-xs" onClick={() => setAllSubtasksCompletion(task.id, false)}>Desmarcar todas</button>
                              <button className="bg-zinc-600 hover:bg-zinc-700 text-white px-3 py-1 rounded text-xs" onClick={() => clearCompletedSubtasks(task.id)}>Limpar concluídas</button>
                            </div>
                          </div>

                          {/* Anexos */}
                          {Array.isArray(task.attachments) && task.attachments.length > 0 && (
                            <div className="mt-3">
                              <div className="text-sm text-gray-200 mb-2">Anexos:</div>
                              <div className="flex flex-wrap gap-3 justify-center">
                                {task.attachments.map((f) => {
                                  const isImage = /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(f.name || f.url);
                                  return (
                                    <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className="block">
                                      {isImage ? (
                                        <img src={f.url} alt={f.name} className="w-24 h-24 object-cover rounded shadow"/>
                                      ) : (
                                        <div className="px-3 py-2 rounded bg-white/10 border border-white/20 text-xs text-white">{f.name || 'Arquivo'}</div>
                                      )}
                                    </a>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          <div className="flex flex-wrap gap-2 justify-center">
                            <motion.button 
                              onClick={() => startEditing(task)} 
                              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm transition-all duration-200"
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              ✏️ Editar
                            </motion.button>
                            <motion.button 
                              onClick={() => deleteTask(task.id)} 
                              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm transition-all duration-200"
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              🗑️ Excluir
                            </motion.button>
                            <motion.button 
                              onClick={() => toggleTitleAlignment(task.id)} 
                              className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-lg text-sm transition-all duration-200"
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              🔀 Alinhar Título
                            </motion.button>
                            <motion.button 
                              onClick={() => toggleDescAlignment(task.id)} 
                              className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm transition-all duration-200"
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              📝 Alinhar Descrição
                            </motion.button>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
              )}
              
              {tasks.length === 0 && (
                <motion.div 
                  className="text-center py-12"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                >
                  <div className="text-6xl mb-4">📝</div>
                  <p className="text-gray-300 text-xl">Nenhuma tarefa criada ainda</p>
                  <p className="text-gray-400">Crie sua primeira tarefa acima!</p>
                </motion.div>
              )}
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}

export default TaskManager;
