import { useState, useEffect, useRef } from "react";
import { db, auth, provider, signInWithPopup, signOut } from "./firebaseConfig";
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

  // Estados para as tags globais
  const [availableTags, setAvailableTags] = useState([]);
  const [newTag, setNewTag] = useState("");
  const [newTagColor, setNewTagColor] = useState("#cccccc");
  const [newTagTextColor, setNewTagTextColor] = useState("#000000");

  // Estados para gerenciamento de tags na visualização
  const [tagEditingTaskId, setTagEditingTaskId] = useState(null);
  const [tagEditingInput, setTagEditingInput] = useState("");

  // Estado para o usuário
  const [user, setUser] = useState(null);

  // Refs para os elementos contentEditable na edição
  const editingPriorityRef = useRef(null);
  const editingTitleRef = useRef(null);
  const editingDescriptionRef = useRef(null);

  useEffect(() => {
    auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        loadTasks(currentUser.uid);
      } else {
        setTasks([]);
      }
    });
  }, []);

  async function loadTasks(userId) {
    const q = query(collection(db, "tasks"), where("userId", "==", userId));
    const querySnapshot = await getDocs(q);
    const tasksList = querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const effectiveSort = (task) =>
      task.priority && parseInt(task.priority) >= 1 ? parseInt(task.priority) : Infinity;
    setTasks(tasksList.sort((a, b) => effectiveSort(a) - effectiveSort(b)));
  }

  async function login() {
    const result = await signInWithPopup(auth, provider);
    setUser(result.user);
  }

  async function logout() {
    await signOut(auth);
    setUser(null);
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
    const taskData = {
      priority: newTaskPriority ? parseInt(newTaskPriority) : null,
      title: newTaskTitle,
      titleTextColor: newTaskTitleTextColor,
      titleFont: newTaskTitleFont,
      description: newTaskDescription,
      descriptionColor: newTaskDescColor,
      descriptionFont: newTaskDescFont,
      descriptionFontSize: newTaskDescFontSize,
      areaColor: newTaskAreaColor,
      completed: false,
      userId: user.uid,
      tags: [],
      textAlignTitle: "center",
      textAlignDescription: "center",
    };
    const docRef = await addDoc(collection(db, "tasks"), taskData);
    setTasks(
      [...tasks, { id: docRef.id, ...taskData }].sort(
        (a, b) =>
          (a.priority && parseInt(a.priority) >= 1 ? parseInt(a.priority) : Infinity) -
          (b.priority && parseInt(b.priority) >= 1 ? parseInt(b.priority) : Infinity)
      )
    );
  }

  async function toggleTask(id, completed) {
    const taskRef = doc(db, "tasks", id);
    await updateDoc(taskRef, { completed: !completed });
    setTasks(
      tasks.map((task) => (task.id === id ? { ...task, completed: !completed } : task))
    );
  }

  async function deleteTask(id) {
    await deleteDoc(doc(db, "tasks", id));
    setTasks(tasks.filter((task) => task.id !== id));
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
      title: editingTitle,
      titleTextColor: editingTitleTextColor,
      titleFont: editingTitleFont,
      description: editingDescription,
      descriptionColor: editingDescColor,
      descriptionFont: editingDescFont,
      descriptionFontSize: editingDescFontSize,
      tags: editingTaskTags,
      areaColor: editingAreaColor,
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

  function removeTagFromEditing(tagName) {
    setEditingTaskTags(editingTaskTags.filter((t) => t.name !== tagName));
  }

  // Atualiza as tags de uma tarefa no Firestore e no estado
  async function updateTaskTags(taskId, newTags) {
    const taskRef = doc(db, "tasks", taskId);
    await updateDoc(taskRef, { tags: newTags });
    setTasks(tasks.map((task) => (task.id === taskId ? { ...task, tags: newTags } : task)));
  }

  // Função para adicionar tag via input (digitada) na área de gerenciamento de tags da visualização
  async function handleAddEditingTag(taskId) {
    if (!tagEditingInput.trim()) return;
    const existingTag = availableTags.find(
      (t) => t.name.toLowerCase() === tagEditingInput.toLowerCase()
    );
    let tagToAdd;
    if (existingTag) {
      tagToAdd = existingTag;
    } else {
      tagToAdd = { name: tagEditingInput, bgColor: "#cccccc", textColor: "#000000" };
      setAvailableTags([...availableTags, tagToAdd]);
    }
    const task = tasks.find((t) => t.id === taskId);
    if (task && !task.tags.some((t) => t.name.toLowerCase() === tagToAdd.name.toLowerCase())) {
      const newTags = [...(task.tags || []), tagToAdd];
      await updateTaskTags(taskId, newTags);
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
    if (task && !task.tags.some((t) => t.name.toLowerCase() === tagName.toLowerCase())) {
      const newTags = [...(task.tags || []), globalTag];
      await updateTaskTags(taskId, newTags);
    }
  }

  // Função para remover tag na área de gerenciamento de tags da visualização
  async function handleRemoveTag(taskId, tagName) {
    const task = tasks.find((t) => t.id === taskId);
    if (task) {
      const newTags = task.tags.filter(
        (t) => t.name.toLowerCase() !== tagName.toLowerCase()
      );
      await updateTaskTags(taskId, newTags);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4 flex flex-col">
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

        {!user ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <motion.div
              className="text-center w-full max-w-md mx-auto"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
            >
              <div className="p-12 rounded-3xl backdrop-blur-xl bg-white/10 border border-white/20 shadow-2xl">
                <h2 className="text-3xl font-semibold text-white mb-6 text-center">Bem-vindo!</h2>
                <p className="text-gray-300 mb-8 text-center">Faça login para gerenciar suas tarefas</p>
                <div className="flex justify-center">
                  <motion.button
                    onClick={login}
                    className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white px-8 py-4 rounded-xl font-semibold text-lg shadow-lg transition-all duration-200"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    🔑 Login com Google
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
              <h2 className="text-2xl font-bold text-center text-white mb-6">✨ Nova Tarefa</h2>
              
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
              
              <div className="flex gap-3 mb-6">
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
              </div>
              
              <motion.button 
                onClick={addTask} 
                className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white px-6 py-4 rounded-xl font-semibold text-lg shadow-lg transition-all duration-200"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                ➕ Adicionar Tarefa
              </motion.button>
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
                  onClick={() => {
                    if (newTag.trim()) {
                      if (
                        !availableTags.some(
                          (t) => t.name.toLowerCase() === newTag.toLowerCase()
                        )
                      ) {
                        setAvailableTags([
                          ...availableTags,
                          { name: newTag, bgColor: newTagColor, textColor: newTagTextColor },
                        ]);
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
                    <span>{tag.name}</span>
                    <button
                      onClick={() =>
                        setAvailableTags(availableTags.filter((t) => t.name !== tag.name))
                      }
                      className="bg-red-500 hover:bg-red-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs transition-all duration-200"
                    >
                      ×
                    </button>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Listas Criadas */}
            <motion.div 
              className="p-6 rounded-3xl backdrop-blur-xl bg-white/10 border border-white/20 shadow-2xl"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              <h2 className="text-2xl font-bold text-center text-white mb-6">📋 Suas Tarefas</h2>
              
              <div className="space-y-4">
                {tasks.map((task, index) => {
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
                      <div className="flex justify-end mb-4">
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
                              </div>
                            </div>
                          </div>
                          
                          <div
                            contentEditable
                            ref={(el) => (editingDescriptionRef.current = el)}
                            className="description-text px-4 py-3 bg-white/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400"
                            onInput={(e) => {
                              const saved = saveSelection(editingDescriptionRef.current);
                              setEditingDescription(e.currentTarget.textContent);
                              setTimeout(() => {
                                restoreSelection(editingDescriptionRef.current, saved);
                              }, 0);
                            }}
                            suppressContentEditableWarning={true}
                            style={{ whiteSpace: "pre-wrap" }}
                          >
                            {editingDescription}
                          </div>
                          
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
                          
                          <div
                            className={`description-text text-lg ${task.completed ? "line-through" : ""}`}
                            style={{
                              color: task.descriptionColor || "#000000",
                              fontFamily: task.descriptionFont || "Arial",
                              fontSize: task.descriptionFontSize ? task.descriptionFontSize + "px" : "18px",
                              textAlign: task.textAlignDescription || "center",
                              wordWrap: "break-word",
                            }}
                          >
                            {task.description}
                          </div>
                          
                          {task.tags && task.tags.length > 0 && (
                            <div className="flex flex-wrap justify-center gap-2">
                              {task.tags.map((tag) => (
                                <span
                                  key={tag.name}
                                  className="px-3 py-1 rounded-full text-sm font-medium"
                                  style={{
                                    backgroundColor: tag.bgColor,
                                    color: tag.textColor,
                                  }}
                                >
                                  {tag.name}
                                </span>
                              ))}
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
