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
const predefinedFonts = ["Arial", "Helvetica", "Times New Roman", "Courier New", "Verdana"];

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
    <div className="container mt-4" style={{ maxWidth: "800px" }}>
      {/* Cabeçalho */}
      <div className="text-center mb-4">
        <h1 className="text-3xl font-bold">Task Manager</h1>
        {user && (
          <button onClick={logout} className="btn btn-danger mt-3">
            🚪 Sair
          </button>
        )}
      </div>

      {!user ? (
        <div className="text-center">
          <button onClick={login} className="btn btn-primary btn-lg">
            🔑 Login com Google
          </button>
        </div>
      ) : (
        <>
          {/* Nova Tarefa */}
          <div className="card mb-4 shadow">
            <div className="card-body">
              <h2 className="card-title text-center">Nova Tarefa</h2>
              <div className="d-flex gap-2 mb-2">
                <input
                  type="number"
                  className="form-control text-center"
                  placeholder="Prioridade"
                  value={newTaskPriority || ""}
                  onChange={(e) => setNewTaskPriority(e.target.value)}
                />
                <input
                  className="form-control text-center"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="Título da tarefa"
                />
                <input
                  type="color"
                  value={newTaskTitleTextColor}
                  onChange={(e) => setNewTaskTitleTextColor(e.target.value)}
                  title="Cor do Texto do Título"
                  className="form-control form-control-color"
                />
                <select
                  className="form-select"
                  value={newTaskTitleFont}
                  onChange={(e) => setNewTaskTitleFont(e.target.value)}
                >
                  {predefinedFonts.map((font) => (
                    <option key={font} value={font} style={{ fontFamily: font }}>
                      {font}
                    </option>
                  ))}
                </select>
              </div>
              <div className="d-flex gap-2 mb-2">
                <textarea
                  className="form-control"
                  value={newTaskDescription}
                  onChange={(e) => setNewTaskDescription(e.target.value)}
                  placeholder="Digite a descrição da tarefa..."
                  style={{ whiteSpace: "pre-wrap" }}
                />
                <div className="d-flex flex-column gap-2">
                  <input
                    type="color"
                    value={newTaskAreaColor}
                    onChange={(e) => setNewTaskAreaColor(e.target.value)}
                    title="Cor da Área da Lista"
                    className="form-control form-control-color"
                    style={{ maxWidth: "80px" }}
                  />
                  <input
                    type="color"
                    value={newTaskDescColor}
                    onChange={(e) => setNewTaskDescColor(e.target.value)}
                    title="Cor do Texto da Descrição"
                    className="form-control form-control-color"
                    style={{ maxWidth: "80px" }}
                  />
                </div>
              </div>
              <div className="d-flex gap-2 mb-2">
                <select
                  className="form-select"
                  value={newTaskDescFont}
                  onChange={(e) => setNewTaskDescFont(e.target.value)}
                >
                  {predefinedFonts.map((font) => (
                    <option key={font} value={font} style={{ fontFamily: font }}>
                      {font}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  className="form-control"
                  placeholder="Tamanho da Fonte (ex: 14)"
                  value={newTaskDescFontSize}
                  onChange={(e) => setNewTaskDescFontSize(e.target.value)}
                />
              </div>
              <button onClick={addTask} className="btn btn-success w-100">
                ➕ Adicionar Tarefa
              </button>
            </div>
          </div>

          {/* Gerenciar Tags Globais */}
          <div className="card mb-4 shadow">
            <div className="card-body">
              <h2 className="card-title text-center">Gerenciar Tags Globais</h2>
              <div className="d-flex gap-2 mb-2">
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Nome da tag"
                  className="form-control text-center"
                />
                <input
                  type="color"
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                  title="Cor de Fundo da Tag"
                  className="form-control form-control-color"
                />
                <input
                  type="color"
                  value={newTagTextColor}
                  onChange={(e) => setNewTagTextColor(e.target.value)}
                  title="Cor do Texto da Tag"
                  className="form-control form-control-color"
                />
                <button
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
                  className="btn btn-info"
                >
                  + Tag
                </button>
              </div>
              <div className="d-flex flex-wrap justify-content-center gap-2">
                {availableTags.map((tag) => (
                  <div
                    key={tag.name}
                    className="d-flex align-items-center gap-1 px-2 py-1 rounded"
                    style={{
                      backgroundColor: tag.bgColor,
                      color: tag.textColor,
                      margin: "4px",
                    }}
                  >
                    <span>{tag.name}</span>
                    <button
                      onClick={() =>
                        setAvailableTags(availableTags.filter((t) => t.name !== tag.name))
                      }
                      className="btn btn-sm btn-danger"
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Listas Criadas */}
          <div className="card shadow">
            <div className="card-body">
              <h2 className="card-title text-center">Listas Criadas</h2>
              {tasks.map((task) => {
                const areaBg = task.areaColor || "#808080";
                return (
                  <motion.div
                    key={task.id}
                    style={{ backgroundColor: areaBg }}
                    className={`rounded p-4 mb-3 shadow-sm w-100 ${task.completed ? "completed-task" : ""} task-item`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <div className="d-flex justify-content-end mb-2">
                      <input
                        type="checkbox"
                        checked={task.completed}
                        onChange={() => toggleTask(task.id, task.completed)}
                        className="form-check-input"
                      />
                    </div>
                    {editingTaskId === task.id ? (
                      <div className="w-100">
                        <div className="d-flex gap-2 mb-2">
                          <div
                            contentEditable
                            ref={(el) => (editingPriorityRef.current = el)}
                            className="priority-number editable"
                            onInput={(e) => {
                              const saved = saveSelection(editingPriorityRef.current);
                              const savedScroll = window.pageYOffset;
                              setEditingPriority(e.currentTarget.textContent);
                              setTimeout(() => {
                                restoreSelection(editingPriorityRef.current, saved);
                                window.scrollTo(0, savedScroll);
                              }, 0);
                            }}
                            suppressContentEditableWarning={true}
                          >
                            {editingPriority}
                          </div>
                          <div className="d-flex flex-column gap-1">
                            <div
                              contentEditable
                              ref={(el) => (editingTitleRef.current = el)}
                              className="title-number editable"
                              onInput={(e) => {
                                const saved = saveSelection(editingTitleRef.current);
                                const savedScroll = window.pageYOffset;
                                setEditingTitle(e.currentTarget.textContent);
                                setTimeout(() => {
                                  restoreSelection(editingTitleRef.current, saved);
                                  window.scrollTo(0, savedScroll);
                                }, 0);
                              }}
                              suppressContentEditableWarning={true}
                              style={{ whiteSpace: "pre-wrap" }}
                            >
                              {editingTitle}
                            </div>
                            <div className="d-flex align-items-center gap-2">
                              <label className="mb-0">Cor do Título:</label>
                              <input
                                type="color"
                                className="form-control form-control-color"
                                style={{ maxWidth: "80px" }}
                                value={editingTitleTextColor}
                                onChange={(e) => setEditingTitleTextColor(e.target.value)}
                              />
                            </div>
                            <div className="d-flex align-items-center gap-2">
                              <label className="mb-0">Fonte do Título:</label>
                              <select
                                className="form-select"
                                value={editingTitleFont}
                                onChange={(e) => setEditingTitleFont(e.target.value)}
                              >
                                {predefinedFonts.map((font) => (
                                  <option key={font} value={font} style={{ fontFamily: font }}>
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
                          className="description-text editable mb-2"
                          onInput={(e) => {
                            const saved = saveSelection(editingDescriptionRef.current);
                            const savedScroll = window.pageYOffset;
                            setEditingDescription(e.currentTarget.textContent);
                            setTimeout(() => {
                              restoreSelection(editingDescriptionRef.current, saved);
                              window.scrollTo(0, savedScroll);
                            }, 0);
                          }}
                          suppressContentEditableWarning={true}
                          style={{ whiteSpace: "pre-wrap" }}
                        >
                          {editingDescription}
                        </div>
                        <div className="d-flex align-items-center gap-2 mb-2">
                          <label className="mb-0">Cor da Área:</label>
                          <input
                            type="color"
                            className="form-control form-control-color"
                            style={{ maxWidth: "80px" }}
                            value={editingAreaColor || "#808080"}
                            onChange={(e) => setEditingAreaColor(e.target.value)}
                          />
                        </div>
                        <div className="d-flex gap-2 mb-2">
                          <div className="d-flex align-items-center gap-2">
                            <label className="mb-0">Cor do Texto da Descrição:</label>
                            <input
                              type="color"
                              className="form-control form-control-color"
                              style={{ maxWidth: "80px" }}
                              value={editingDescColor}
                              onChange={(e) => setEditingDescColor(e.target.value)}
                            />
                          </div>
                          <div className="d-flex align-items-center gap-2">
                            <label className="mb-0">Fonte da Descrição:</label>
                            <select
                              className="form-select"
                              value={editingDescFont}
                              onChange={(e) => setEditingDescFont(e.target.value)}
                            >
                              {predefinedFonts.map((font) => (
                                <option key={font} value={font} style={{ fontFamily: font }}>
                                  {font}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="d-flex align-items-center gap-2">
                            <label className="mb-0">Tamanho da Fonte:</label>
                            <input
                              type="number"
                              className="form-control"
                              style={{ maxWidth: "80px" }}
                              value={editingDescFontSize}
                              onChange={(e) => setEditingDescFontSize(e.target.value)}
                            />
                          </div>
                        </div>
                        {/* Campo para adicionar tag via input */}
                        <div className="input-group mb-2">
                          <input
                            type="text"
                            className="form-control"
                            placeholder="Digite a tag"
                            value={editingTagInput}
                            onChange={(e) => setEditingTagInput(e.target.value)}
                          />
                          <button
                            onClick={() => handleAddEditingTag(task.id)}
                            className="btn btn-outline-secondary"
                          >
                            Adicionar Tag
                          </button>
                        </div>
                        {/* Select para escolher uma tag global já existente */}
                        <div className="mb-2">
                          <select
                            className="form-select"
                            defaultValue=""
                            onChange={(e) => {
                              if (e.target.value) {
                                handleSelectTag(task.id, e.target.value);
                              }
                            }}
                          >
                            <option value="" disabled>
                              Selecione uma tag existente
                            </option>
                            {availableTags
                              .filter(
                                (t) =>
                                  !task.tags ||
                                  !task.tags.some(
                                    (tag) => tag.name.toLowerCase() === t.name.toLowerCase()
                                  )
                              )
                              .map((tag) => (
                                <option key={tag.name} value={tag.name}>
                                  {tag.name}
                                </option>
                              ))}
                          </select>
                        </div>
                        <div className="d-flex flex-wrap justify-content-center gap-2 mb-2">
                          {editingTaskTags.map((tag) => (
                            <div
                              key={tag.name}
                              className="d-flex align-items-center gap-1 rounded px-2 py-1"
                              style={{
                                backgroundColor: tag.bgColor,
                                color: tag.textColor,
                                margin: "4px",
                              }}
                            >
                              <span>{tag.name}</span>
                              <button
                                onClick={() => removeTagFromEditing(tag.name)}
                                className="btn btn-sm btn-danger"
                              >
                                x
                              </button>
                            </div>
                          ))}
                        </div>
                        <div className="d-flex justify-content-center gap-2">
                          <button onClick={saveEditing} className="btn btn-success">
                            Salvar
                          </button>
                          <button onClick={cancelEditing} className="btn btn-secondary">
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="w-100">
                        {task.priority && (
                          <div className="priority-number" style={{ color: getPriorityColor(task.priority) }}>
                            {task.priority}
                          </div>
                        )}
                        <div
                          className="title-number"
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
                          className="description-text"
                          style={{
                            color: task.descriptionColor || "#000000",
                            fontFamily: task.descriptionFont || "Arial",
                            fontSize: task.descriptionFontSize ? task.descriptionFontSize + "px" : "14px",
                            textAlign: task.textAlignDescription || "center",
                            wordWrap: "break-word",
                          }}
                        >
                          {task.description}
                        </div>
                        {task.tags && task.tags.length > 0 && (
                          <div className="d-flex flex-wrap justify-content-center gap-2">
                            {task.tags.map((tag) => (
                              <span
                                key={tag.name}
                                className="px-2 py-1 rounded"
                                style={{
                                  backgroundColor: tag.bgColor,
                                  color: tag.textColor,
                                  margin: "4px",
                                }}
                              >
                                {tag.name}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="d-flex justify-content-center gap-2 mt-2">
                          <button onClick={() => startEditing(task)} className="btn btn-primary">
                            Editar
                          </button>
                          <button onClick={() => deleteTask(task.id)} className="btn btn-danger">
                            ❌ Excluir
                          </button>
                          <button onClick={() => toggleTitleAlignment(task.id)} className="btn btn-secondary">
                            Alinhar Título
                          </button>
                          <button onClick={() => toggleDescAlignment(task.id)} className="btn btn-secondary">
                            Alinhar Descrição
                          </button>
                          <button onClick={() => setTagEditingTaskId(task.id)} className="btn btn-info">
                            Gerenciar Tags
                          </button>
                        </div>
                        {tagEditingTaskId === task.id && (
                          <div className="mt-2">
                            <div className="input-group mb-2">
                              <input
                                type="text"
                                className="form-control"
                                placeholder="Digite a tag"
                                value={tagEditingInput}
                                onChange={(e) => setTagEditingInput(e.target.value)}
                              />
                              <button
                                onClick={() => handleAddEditingTag(task.id)}
                                className="btn btn-outline-secondary"
                              >
                                Adicionar Tag
                              </button>
                            </div>
                            <div className="d-flex flex-wrap justify-content-center gap-2">
                              {task.tags &&
                                task.tags.map((tag) => (
                                  <div
                                    key={tag.name}
                                    className="d-flex align-items-center gap-1 rounded px-2 py-1"
                                    style={{
                                      backgroundColor: tag.bgColor,
                                      color: tag.textColor,
                                      margin: "4px",
                                    }}
                                  >
                                    <span>{tag.name}</span>
                                    <button
                                      onClick={() => handleRemoveTag(task.id, tag.name)}
                                      className="btn btn-sm btn-danger"
                                    >
                                      x
                                    </button>
                                  </div>
                                ))}
                            </div>
                            <button onClick={() => setTagEditingTaskId(null)} className="btn btn-secondary btn-sm">
                              Fechar Gerenciamento de Tags
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default TaskManager;
