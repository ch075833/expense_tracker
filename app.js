const defaultCategories = [
  "Food",
];
const defaultJars = [
  "Food",
];

const storageKey = "expense-tracker-v1";
const defaultState = {
  expenses: [],
  categories: [...defaultCategories],
  jars: [...defaultJars],
  jarBudgets: Object.fromEntries(defaultJars.map((jar) => [jar, 0])),
  wallet: 0,
};

const currency = new Intl.NumberFormat("en-MY", {
  style: "currency",
  currency: "MYR",
});

const elements = {
  form: document.querySelector("#expenseForm"),
  type: document.querySelector("#expenseType"),
  manageTypesButton: document.querySelector("#manageTypesButton"),
  typeDialog: document.querySelector("#typeDialog"),
  closeTypeDialogButton: document.querySelector("#closeTypeDialogButton"),
  customType: document.querySelector("#customType"),
  addTypeButton: document.querySelector("#addTypeButton"),
  amount: document.querySelector("#expenseAmount"),
  note: document.querySelector("#expenseNote"),
  date: document.querySelector("#expenseDate"),
  filter: document.querySelector("#filterType"),
  filterMonth: document.querySelector("#filterMonth"),
  jarsList: document.querySelector("#jarsList"),
  categoryList: document.querySelector("#categoryList"),
  expenseList: document.querySelector("#expenseList"),
  walletAmount: document.querySelector("#walletAmount"),
  totalSpent: document.querySelector("#totalSpent"),
  totalBudget: document.querySelector("#totalBudget"),
  totalRemaining: document.querySelector("#totalRemaining"),
  remainingCard: document.querySelector("#remainingCard"),
  installButton: document.querySelector("#installButton"),
  jarTemplate: document.querySelector("#jarTemplate"),
};

let deferredInstallPrompt = null;
let state = loadState();

function loadState() {
  const saved = localStorage.getItem(storageKey);

  if (!saved) {
    return normalizeState(structuredClone(defaultState));
  }

  try {
    const parsed = JSON.parse(saved);
    return normalizeState({
      expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
      categories: Array.isArray(parsed.categories) ? parsed.categories : defaultState.categories,
      jars: Array.isArray(parsed.jars) ? parsed.jars : defaultState.jars,
      jarBudgets: { ...(parsed.jarBudgets || {}) },
      limits: parsed.limits || {},
      wallet: Number(parsed.wallet) || 0,
    });
  } catch {
    return normalizeState(structuredClone(defaultState));
  }
}

function normalizeState(value) {
  const categorySet = new Set(defaultCategories);
  const jarSet = new Set(defaultJars);

  (value.categories || []).forEach((category) => {
    const cleanCategory = cleanType(category);
    if (cleanCategory) categorySet.add(cleanCategory);
  });

  (value.expenses || []).forEach((expense) => {
    const cleanCategory = cleanType(expense.type);
    if (cleanCategory) categorySet.add(cleanCategory);
    const cleanJar = cleanType(expense.jar);
    if (cleanJar) jarSet.add(cleanJar);
  });

  (value.jars || []).forEach((jar) => {
    const cleanJar = cleanType(jar);
    if (cleanJar) jarSet.add(cleanJar);
  });

  const categories = [...categorySet];
  categories.forEach((category) => {
    if (!findByName(jarSet, category)) jarSet.add(category);
  });

  const jars = [...jarSet];

  const oldLimitTotal = Object.values(value.limits || {}).reduce((sum, amount) => sum + (Number(amount) || 0), 0);
  return {
    expenses: (value.expenses || []).map((expense) => ({
      ...expense,
      jar: findByName(jars, cleanType(expense.type)) || jars[0],
    })),
    categories,
    jars,
    wallet: Number(value.wallet) || 0,
    jarBudgets: jars.reduce((budgets, jar, index) => {
      budgets[jar] = Number(value.jarBudgets?.[jar]) || (index === 0 ? oldLimitTotal : 0);
      return budgets;
    }, {}),
  };
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function cleanType(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function findByName(items, name) {
  const cleanName = cleanType(name).toLowerCase();
  return Array.from(items).find((item) => item.toLowerCase() === cleanName);
}

function getCategories() {
  return state.categories;
}

function getJars() {
  return state.jars;
}

function createOption(value, label = value) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function ensureJar(rawJar) {
  const jar = cleanType(rawJar);
  if (!jar) return null;

  const existing = findByName(state.jars, jar);
  if (existing) return existing;

  state.jars.push(jar);
  state.jarBudgets[jar] = 0;
  return jar;
}

function getJarForType(type) {
  return findByName(getJars(), type) || ensureJar(type) || getJars()[0];
}

function addCategory(rawCategory) {
  const category = cleanType(rawCategory);
  if (!category) return null;

  const existing = state.categories.find((item) => item.toLowerCase() === category.toLowerCase());
  if (existing) {
    ensureJar(existing);
    saveState();
    return existing;
  }

  state.categories.push(category);
  ensureJar(category);
  saveState();
  return category;
}

function isDefaultCategory(category) {
  return defaultCategories.some((item) => item.toLowerCase() === category.toLowerCase());
}

function isDefaultJar(jar) {
  return defaultJars.some((item) => item.toLowerCase() === jar.toLowerCase());
}

function removeCategory(category) {
  if (isDefaultCategory(category)) return;

  const matchingJar = findByName(state.jars, category);
  state.categories = state.categories.filter((item) => item !== category);
  state.expenses = state.expenses.filter((expense) => expense.type !== category);

  if (matchingJar && !isDefaultJar(matchingJar)) {
    const jarHasExpenses = state.expenses.some((expense) => expense.jar === matchingJar);
    const jarHasCategory = state.categories.some((item) => findByName([item], matchingJar));

    if (!jarHasExpenses && !jarHasCategory) {
      state.jars = state.jars.filter((jar) => jar !== matchingJar);
      delete state.jarBudgets[matchingJar];
    }
  }

  saveState();
}

function formatAmount(value) {
  return currency.format(Number(value) || 0);
}

function getJarTotals() {
  return getJars().reduce((totals, jar) => {
    totals[jar] = state.expenses
      .filter((expense) => expense.jar === jar)
      .reduce((sum, expense) => sum + expense.amount, 0);
    return totals;
  }, {});
}

function isOverspent(jar, totals) {
  const budget = Number(state.jarBudgets[jar]) || 0;
  return budget > 0 && totals[jar] > budget;
}

function isAtBudget(jar, totals) {
  const budget = Number(state.jarBudgets[jar]) || 0;
  return budget > 0 && Math.round(totals[jar] * 100) === Math.round(budget * 100);
}

function populateSelects() {
  const selectedType = elements.type.value;
  const selectedFilter = elements.filter.value || "All";

  elements.type.replaceChildren(...getCategories().map((category) => createOption(category)));
  elements.filter.replaceChildren(
    createOption("All", "All types"),
    ...getCategories().map((category) => createOption(category)),
  );

  if (getCategories().includes(selectedType)) {
    elements.type.value = selectedType;
  }

  elements.filter.value = selectedFilter === "All" || getCategories().includes(selectedFilter) ? selectedFilter : "All";
}

function renderSummary(totals) {
  const spent = state.expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const budget = getJars().reduce((sum, jar) => sum + (Number(state.jarBudgets[jar]) || 0), 0);
  const wallet = Number(state.wallet) || 0;
  const remainingBase = wallet || budget;
  const remaining = remainingBase - spent;

  elements.walletAmount.value = wallet || "";
  elements.totalSpent.textContent = formatAmount(spent);
  elements.totalBudget.textContent = formatAmount(budget);
  elements.totalRemaining.textContent = formatAmount(remaining);
  elements.remainingCard.classList.toggle("over", remainingBase > 0 && remaining < 0);
}

function renderJars(totals) {
  elements.jarsList.replaceChildren();

  getJars().forEach((jar) => {
    const row = elements.jarTemplate.content.firstElementChild.cloneNode(true);
    const title = row.querySelector("strong");
    const status = row.querySelector("span");
    const input = row.querySelector("input");
    const spent = totals[jar];
    const budget = Number(state.jarBudgets[jar]) || 0;
    const over = isOverspent(jar, totals);
    const atBudget = isAtBudget(jar, totals);

    title.textContent = jar;
    status.textContent = `${formatAmount(spent)} spent${budget ? ` of ${formatAmount(budget)}` : " - no budget set"}`;
    input.value = budget || "";
    input.dataset.jar = jar;
    row.classList.toggle("over", over);
    row.classList.toggle("at-budget", atBudget);

    input.addEventListener("change", () => {
      state.jarBudgets[jar] = Number(input.value) || 0;
      saveState();
      render();
    });

    elements.jarsList.append(row);
  });
}

function renderCategoryManager() {
  elements.categoryList.replaceChildren();

  getCategories().forEach((category) => {
    const row = document.createElement("article");
    const name = document.createElement("strong");
    const budgetName = document.createElement("span");
    const removeButton = document.createElement("button");

    row.className = "category-row";
    name.textContent = category;
    budgetName.textContent = getJarForType(category);

    removeButton.className = "remove-category-button";
    removeButton.type = "button";
    removeButton.textContent = "Remove";
    removeButton.hidden = isDefaultCategory(category);
    removeButton.addEventListener("click", () => {
      const hasExpenses = state.expenses.some((expense) => expense.type === category);
      const confirmed =
        !hasExpenses || window.confirm(`Remove ${category} and its saved expenses?`);
      if (!confirmed) return;

      removeCategory(category);
      render();
    });

    row.append(name, budgetName, removeButton);
    elements.categoryList.append(row);
  });
}

function renderExpenses(jarTotals) {
  const selectedType = elements.filter.value;
  const selectedMonth = elements.filterMonth.value;
  const expenses = state.expenses
    .filter((expense) => selectedType === "All" || expense.type === selectedType)
    .filter((expense) => !selectedMonth || expense.date.startsWith(selectedMonth))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);

  elements.expenseList.replaceChildren();

  if (!expenses.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No expenses added yet.";
    elements.expenseList.append(empty);
    return;
  }

  expenses.forEach((expense) => {
    const item = document.createElement("article");
    item.className = "expense-item";

    const details = document.createElement("div");
    const title = document.createElement("strong");
    const meta = document.createElement("p");
    title.textContent = expense.type;
    meta.className = "expense-meta";
    meta.textContent = [expense.date, expense.jar, expense.note].filter(Boolean).join(" - ");
    details.append(title, meta);

    const amount = document.createElement("span");
    amount.className = "expense-amount";
    amount.textContent = formatAmount(expense.amount);

    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-button";
    deleteButton.type = "button";
    deleteButton.setAttribute("aria-label", `Delete ${expense.type} expense`);
    deleteButton.textContent = "x";
    deleteButton.addEventListener("click", () => {
      state.expenses = state.expenses.filter((item) => item.id !== expense.id);
      saveState();
      render();
    });

    item.classList.toggle("over-category", isOverspent(expense.jar, jarTotals));
    item.append(details, amount, deleteButton);
    elements.expenseList.append(item);
  });
}

function render() {
  populateSelects();
  const jarTotals = getJarTotals();
  renderSummary(jarTotals);
  renderJars(jarTotals);
  renderCategoryManager();
  renderExpenses(jarTotals);
}

function setToday() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  elements.date.value = `${year}-${month}-${day}`;
}

function setCurrentMonth() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");

  elements.filterMonth.value = `${year}-${month}`;
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();

  const type = elements.type.value;
  if (!type) return;
  const jar = getJarForType(type);

  state.expenses.push({
    id: crypto.randomUUID(),
    type,
    jar,
    amount: Number(elements.amount.value),
    note: elements.note.value.trim(),
    date: elements.date.value,
    createdAt: Date.now(),
  });

  saveState();
  elements.form.reset();
  setToday();
  render();
});

elements.addTypeButton.addEventListener("click", () => {
  const category = addCategory(elements.customType.value);
  if (!category) return;

  elements.customType.value = "";
  render();
  elements.type.value = category;
  renderCategoryManager();
});

elements.customType.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;

  event.preventDefault();
  elements.addTypeButton.click();
});

elements.filter.addEventListener("change", render);

elements.filterMonth.addEventListener("change", render);

elements.walletAmount.addEventListener("change", () => {
  state.wallet = Number(elements.walletAmount.value) || 0;
  saveState();
  render();
});

elements.manageTypesButton.addEventListener("click", () => {
  populateSelects();
  renderCategoryManager();
  elements.typeDialog.showModal();
  elements.customType.focus();
});

elements.closeTypeDialogButton.addEventListener("click", () => {
  elements.typeDialog.close();
});

elements.typeDialog.addEventListener("click", (event) => {
  if (event.target === elements.typeDialog) {
    elements.typeDialog.close();
  }
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  elements.installButton.hidden = false;
});

elements.installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;

  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  elements.installButton.hidden = true;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js");
  });
}

setToday();
setCurrentMonth();
render();
