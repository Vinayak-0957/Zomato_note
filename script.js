
const API =
    (typeof API_BASE_URL !== "undefined")
        ? API_BASE_URL
        : "http://127.0.0.1:8000";

const TOKEN =
    (typeof SECRET_TOKEN !== "undefined")
        ? SECRET_TOKEN
        : "";

let allNotes = [];
let currentNotes = [];
let searchTimer = null;
let isEditing = false;
let editingNoteId = null;

function getHeaders() {
    const headers = {
        "Content-Type": "application/json"
    };

    if (TOKEN) {
        headers["x-token"] = TOKEN;
    }

    return headers;
}

async function apiRequest(url, method = "GET", body = null) {
    const options = {
        method,
        headers: getHeaders()
    };

    if (body !== null) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(API + url, options);
    const text = await response.text();

    let data = null;

    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = text;
    }

    if (!response.ok) {
        let message = "Request failed.";

        if (data && data.detail) {
            if (Array.isArray(data.detail)) {
                message = data.detail
                    .map(item => item.msg || JSON.stringify(item))
                    .join(", ");
            } else {
                message = String(data.detail);
            }
        } else if (typeof data === "string" && data) {
            message = data;
        }

        throw new Error(message);
    }

    return data;
}

function showLoading() {
    const loading = document.getElementById("loading");

    if (loading) {
        loading.style.display = "block";
    }
}

function hideLoading() {
    const loading = document.getElementById("loading");

    if (loading) {
        loading.style.display = "none";
    }
}

function showError(message) {
    const error = document.getElementById("error");

    if (error) {
        error.textContent = message || "";
    }
}

function clearError() {
    showError("");
}

function normalizeNote(note) {
    return {
        id: note.id,
        owner_id: note.owner_id ?? note.ownerId ?? null,
        title: String(note.title ?? ""),
        content: String(note.content ?? ""),
        tag: String(note.tag ?? ""),
        created_at: note.created_at ?? note.createdAt ?? note.date ?? null,
        updated_at: note.updated_at ?? note.updatedAt ?? null
    };
}

async function loadNotes() {
    showLoading();
    clearError();

    try {
        const data = await apiRequest("/notes");

        if (!Array.isArray(data)) {
            throw new Error("The /notes endpoint did not return a list of notes.");
        }

        allNotes = data.map(normalizeNote);
        currentNotes = [...allNotes];

        renderNotes(currentNotes);
        buildCategoryTree(allNotes);
    } catch (error) {
        console.error("Error loading notes:", error);

        allNotes = [];
        currentNotes = [];

        renderNotes([]);

        showError("Unable to load notes: " + error.message);
    } finally {
        hideLoading();
    }
}

function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatDate(dateValue) {
    if (!dateValue) {
        return "";
    }

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    return date.toLocaleString();
}

function renderNotes(notes) {
    const container = document.getElementById("notesContainer");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    if (!notes || notes.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>No notes found.</p>
            </div>
        `;
        return;
    }

    notes.forEach(note => {
        const card = document.createElement("div");

        card.className = "note-card";

        const title = escapeHTML(note.title);
        const content = escapeHTML(note.content);
        const tag = escapeHTML(note.tag);
        const date = formatDate(note.created_at);

        card.innerHTML = `
            <div class="note-card-content">
                <h3>${title}</h3>
                <p>${content}</p>

                ${
                    note.tag
                        ? `
                            <span class="note-tag">
                                ${tag}
                            </span>
                        `
                        : ""
                }

                ${
                    date
                        ? `
                            <small class="note-date">
                                ${escapeHTML(date)}
                            </small>
                        `
                        : ""
                }

                <div class="note-actions">
                    <button
                        type="button"
                        class="edit-btn"
                        data-id="${note.id}">
                        ✏ Edit
                    </button>

                    <button
                        type="button"
                        class="delete-btn"
                        data-id="${note.id}">
                        🗑 Delete
                    </button>
                </div>
            </div>
        `;

        const editButton = card.querySelector(".edit-btn");
        const deleteButton = card.querySelector(".delete-btn");

        if (editButton) {
            editButton.addEventListener(
                "click",
                () => editNote(note.id)
            );
        }

        if (deleteButton) {
            deleteButton.addEventListener(
                "click",
                () => deleteNote(note.id)
            );
        }

        container.appendChild(card);
    });
}

function performKeywordSearch() {
    const searchInput = document.getElementById("search");

    if (!searchInput) {
        return;
    }

    const query = searchInput.value.trim().toLowerCase();

    if (!query) {
        currentNotes = [...allNotes];
        applySort();
        return;
    }

    const words = query
        .split(/\s+/)
        .filter(word => word.length > 0);

    currentNotes = allNotes.filter(note => {
        const searchableText = (
            note.title +
            " " +
            note.content +
            " " +
            note.tag
        ).toLowerCase();

        return words.every(
            word => searchableText.includes(word)
        );
    });

    applySort();
}

function setupSearch() {
    const searchInput = document.getElementById("search");

    if (!searchInput) {
        return;
    }

    searchInput.addEventListener(
        "input",
        function () {
            clearTimeout(searchTimer);

            searchTimer = setTimeout(
                performKeywordSearch,
                300
            );
        }
    );
}

function relevanceScore(note, query) {
    if (!query) {
        return 0;
    }

    const title = note.title.toLowerCase();
    const content = note.content.toLowerCase();
    const tag = note.tag.toLowerCase();

    let score = 0;

    if (title === query) {
        score += 100;
    }

    if (title.includes(query)) {
        score += 50;
    }

    if (tag.includes(query)) {
        score += 30;
    }

    if (content.includes(query)) {
        score += 10;
    }

    return score;
}

function applySort() {
    const sort = document.getElementById("sort");

    let notes = [...currentNotes];

    if (sort && sort.value === "date") {
        notes.sort((a, b) => {
            const dateA = new Date(
                a.created_at || 0
            ).getTime();

            const dateB = new Date(
                b.created_at || 0
            ).getTime();

            return dateB - dateA;
        });
    } else {
        const searchInput =
            document.getElementById("search");

        const query = searchInput
            ? searchInput.value.trim().toLowerCase()
            : "";

        notes.sort((a, b) => {
            return (
                relevanceScore(b, query) -
                relevanceScore(a, query)
            );
        });
    }

    renderNotes(notes);
}

function setupSorting() {
    const sort = document.getElementById("sort");

    if (!sort) {
        return;
    }

    sort.addEventListener(
        "change",
        applySort
    );
}

async function handleNoteSubmit(event) {
    event.preventDefault();

    clearError();

    const ownerElement =
        document.getElementById("ownerId");

    const titleElement =
        document.getElementById("title");

    const contentElement =
        document.getElementById("content");

    const tagElement =
        document.getElementById("tag");

    const ownerId =
        Number(ownerElement.value);

    const title =
        titleElement.value.trim();

    const content =
        contentElement.value.trim();

    const tag =
        tagElement.value.trim();

    if (
        !Number.isInteger(ownerId) ||
        ownerId <= 0
    ) {
        showError(
            "Please enter a valid Owner ID."
        );

        return;
    }

    if (!title) {
        showError(
            "Please enter a note title."
        );

        titleElement.focus();

        return;
    }

    if (!content) {
        showError(
            "Please enter note content."
        );

        contentElement.focus();

        return;
    }

    if (!tag) {
        showError(
            "Please enter a tag."
        );

        tagElement.focus();

        return;
    }

    const payload = {
        owner_id: ownerId,
        title,
        content,
        tag
    };

    const submitButton =
        document.getElementById(
            "submitBtn"
        );

    try {
        if (submitButton) {
            submitButton.disabled = true;
        }

        if (
            isEditing &&
            editingNoteId !== null
        ) {
            await apiRequest(
                `/notes/${editingNoteId}`,
                "PUT",
                payload
            );

            alert(
                "Note updated successfully."
            );
        } else {
            await apiRequest(
                "/notes",
                "POST",
                payload
            );

            alert(
                "Note added successfully."
            );
        }

        resetNoteForm();

        await loadNotes();
    } catch (error) {
        console.error(
            "Note submission error:",
            error
        );

        showError(
            error.message
        );
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
        }
    }
}

function resetNoteForm() {
    const form =
        document.getElementById(
            "noteForm"
        );

    if (form) {
        form.reset();
    }

    const owner =
        document.getElementById(
            "ownerId"
        );

    if (owner) {
        owner.value = "1";
    }

    isEditing = false;
    editingNoteId = null;

    const button =
        document.getElementById(
            "submitBtn"
        );

    if (button) {
        button.textContent =
            "Add Note";
    }

    clearError();
}

async function editNote(id) {
    clearError();

    try {
        let note =
            allNotes.find(
                item =>
                    String(item.id) ===
                    String(id)
            );

        if (!note) {
            note =
                await apiRequest(
                    `/notes/${id}`
                );

            note =
                normalizeNote(note);
        }

        document.getElementById(
            "ownerId"
        ).value =
            note.owner_id ?? 1;

        document.getElementById(
            "title"
        ).value =
            note.title ?? "";

        document.getElementById(
            "content"
        ).value =
            note.content ?? "";

        document.getElementById(
            "tag"
        ).value =
            note.tag ?? "";

        isEditing = true;
        editingNoteId = id;

        const button =
            document.getElementById(
                "submitBtn"
            );

        if (button) {
            button.textContent =
                "Update Note";
        }

        const section =
            document.getElementById(
                "add-note-section"
            );

        if (section) {
            section.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        }
    } catch (error) {
        console.error(
            "Edit note error:",
            error
        );

        showError(
            "Unable to edit note: " +
            error.message
        );
    }
}

async function deleteNote(id) {
    const confirmed =
        confirm(
            "Are you sure you want to delete this note?"
        );

    if (!confirmed) {
        return;
    }

    clearError();

    try {
        await apiRequest(
            `/notes/${id}`,
            "DELETE"
        );

        alert(
            "Note deleted successfully."
        );

        await loadNotes();
    } catch (error) {
        console.error(
            "Delete note error:",
            error
        );

        showError(
            "Unable to delete note: " +
            error.message
        );
    }
}

function prepareTitleArray() {
    return [...allNotes].sort(
        (a, b) =>
            a.title
                .toLowerCase()
                .localeCompare(
                    b.title.toLowerCase()
                )
    );
}

function binarySearchIterative(
    notes,
    target
) {
    let left = 0;
    let right = notes.length - 1;

    const search =
        target.trim().toLowerCase();

    while (left <= right) {
        const middle =
            Math.floor(
                (left + right) / 2
            );

        const middleTitle =
            notes[middle]
                .title
                .toLowerCase();

        if (
            middleTitle === search
        ) {
            return notes[middle];
        }

        if (
            middleTitle < search
        ) {
            left =
                middle + 1;
        } else {
            right =
                middle - 1;
        }
    }

    return null;
}

function binarySearchRecursive(
    notes,
    target,
    left = 0,
    right = notes.length - 1
) {
    const search =
        target.trim().toLowerCase();

    if (left > right) {
        return null;
    }

    const middle =
        Math.floor(
            (left + right) / 2
        );

    const middleTitle =
        notes[middle]
            .title
            .toLowerCase();

    if (
        middleTitle === search
    ) {
        return notes[middle];
    }

    if (
        middleTitle < search
    ) {
        return binarySearchRecursive(
            notes,
            target,
            middle + 1,
            right
        );
    }

    return binarySearchRecursive(
        notes,
        target,
        left,
        middle - 1
    );
}

function findExactTitle() {
    const input =
        document.getElementById(
            "exactTitle"
        );

    const result =
        document.getElementById(
            "lookupResult"
        );

    if (!input || !result) {
        return;
    }

    const target =
        input.value.trim();

    if (!target) {
        result.textContent =
            "Please enter an exact note title.";

        return;
    }

    const notes =
        prepareTitleArray();

    const algorithm =
        document.getElementById(
            "lookupAlgo"
        )?.value ||
        "iterative";

    let found = null;

    if (
        algorithm === "recursive"
    ) {
        found =
            binarySearchRecursive(
                notes,
                target
            );
    } else {
        found =
            binarySearchIterative(
                notes,
                target
            );
    }

    if (!found) {
        result.textContent =
            `No note found with title "${target}".`;

        return;
    }

    result.innerHTML = `
        Found:
        <strong>
            ${escapeHTML(found.title)}
        </strong>
    `;

    scrollToNote(
        found.id
    );
}

function scrollToNote(id) {
    const search =
        document.getElementById(
            "search"
        );

    if (search) {
        search.value = "";
    }

    currentNotes =
        [...allNotes];

    applySort();

    setTimeout(
        () => {
            const cards =
                document.querySelectorAll(
                    ".note-card"
                );

            for (
                const card of cards
            ) {
                const editButton =
                    card.querySelector(
                        ".edit-btn"
                    );

                if (
                    editButton &&
                    String(
                        editButton.dataset.id
                    ) ===
                    String(id)
                ) {
                    card.scrollIntoView({
                        behavior: "smooth",
                        block: "center"
                    });

                    card.classList.add(
                        "highlight-note"
                    );

                    setTimeout(
                        () => {
                            card.classList.remove(
                                "highlight-note"
                            );
                        },
                        2500
                    );

                    break;
                }
            }
        },
        100
    );
}

function quickTagSearch(tag) {
    const result =
        document.getElementById(
            "quickFindResult"
        );

    if (!result) {
        return;
    }

    const target =
        String(tag)
            .trim()
            .toLowerCase();

    if (!target) {
        return;
    }

    let found = null;

    for (
        let i = 0;
        i < allNotes.length;
        i++
    ) {
        if (
            allNotes[i]
                .tag
                .trim()
                .toLowerCase() ===
            target
        ) {
            found =
                allNotes[i];

            break;
        }
    }

    if (!found) {
        result.textContent =
            `No note found with tag "${tag}".`;

        return;
    }

    result.innerHTML = `
        Found note:
        <strong>
            ${escapeHTML(found.title)}
        </strong>
    `;

    const search =
        document.getElementById(
            "search"
        );

    if (search) {
        search.value = "";
    }

    currentNotes =
        [...allNotes];

    applySort();

    scrollToNote(
        found.id
    );
}

function setupQuickTagSearch() {
    const buttons =
        document.querySelectorAll(
            ".tag-jump-btn"
        );

    buttons.forEach(
        button => {
            button.addEventListener(
                "click",
                function () {
                    quickTagSearch(
                        this.dataset.tag
                    );
                }
            );
        }
    );
}

function buildCategoryTree(
    notes
) {
    const container =
        document.getElementById(
            "treeContainer"
        );

    if (!container) {
        return;
    }

    container.innerHTML = "";

    const tree = {};

    notes.forEach(
        note => {
            const rawTag =
                note.tag.trim();

            if (!rawTag) {
                return;
            }

            const parts =
                rawTag
                    .split("/")
                    .map(
                        part =>
                            part.trim()
                    )
                    .filter(
                        Boolean
                    );

            let current =
                tree;

            parts.forEach(
                part => {
                    if (
                        !current[part]
                    ) {
                        current[part] = {};
                    }

                    current =
                        current[part];
                }
            );
        }
    );

    if (
        Object.keys(tree).length === 0
    ) {
        container.innerHTML =
            "<p>No categories yet.</p>";

        return;
    }

    const root =
        document.createElement(
            "ul"
        );

    root.className =
        "category-tree";

    renderTreeLevel(
        tree,
        root
    );

    container.appendChild(
        root
    );
}

function renderTreeLevel(
    tree,
    parentElement
) {
    const names =
        Object.keys(tree)
            .sort(
                (a, b) =>
                    a.localeCompare(b)
            );

    names.forEach(
        name => {
            const li =
                document.createElement(
                    "li"
                );

            const button =
                document.createElement(
                    "button"
                );

            button.type =
                "button";

            button.className =
                "category-button";

            button.textContent =
                name;

            button.addEventListener(
                "click",
                () =>
                    filterByCategory(
                        name
                    )
            );

            li.appendChild(
                button
            );

            const children =
                tree[name];

            if (
                children &&
                Object.keys(
                    children
                ).length > 0
            ) {
                const childList =
                    document.createElement(
                        "ul"
                    );

                renderTreeLevel(
                    children,
                    childList
                );

                li.appendChild(
                    childList
                );
            }

            parentElement.appendChild(
                li
            );
        }
    );
}

function filterByCategory(
    category
) {
    const target =
        category
            .trim()
            .toLowerCase();

    currentNotes =
        allNotes.filter(
            note =>
                note.tag
                    .toLowerCase()
                    .includes(target)
        );

    const search =
        document.getElementById(
            "search"
        );

    if (search) {
        search.value =
            category;
    }

    applySort();
}

async function smartSearch() {
    const input =
        document.getElementById(
            "smartInput"
        );

    const resultsContainer =
        document.getElementById(
            "smartResults"
        );

    if (
        !input ||
        !resultsContainer
    ) {
        return;
    }

    const query =
        input.value.trim();

    if (!query) {
        resultsContainer.innerHTML =
            "<p>Please describe what you are looking for.</p>";

        return;
    }

    resultsContainer.innerHTML =
        "<p>Searching with AI...</p>";

    try {
        const data =
            await apiRequest(
                `/notes/smart-search?query=${encodeURIComponent(query)}`
            );

        let results = [];

        if (
            Array.isArray(data)
        ) {
            results =
                data;
        } else if (
            data &&
            Array.isArray(
                data.results
            )
        ) {
            results =
                data.results;
        } else if (
            data &&
            Array.isArray(
                data.items
            )
        ) {
            results =
                data.items;
        }

        resultsContainer.innerHTML =
            "";

        if (
            results.length === 0
        ) {
            resultsContainer.innerHTML =
                "<p>No semantically similar notes found.</p>";

            return;
        }

        results.forEach(
            item => {
                const card =
                    document.createElement(
                        "div"
                    );

                card.className =
                    "search-card";

                const title =
                    escapeHTML(
                        item.title ??
                        item.note?.title ??
                        "Untitled"
                    );

                const content =
                    escapeHTML(
                        item.summary ??
                        item.content ??
                        item.note?.content ??
                        ""
                    );

                const scoreValue =
                    item.score ??
                    item.similarity ??
                    item.similarity_score ??
                    null;

                let scoreText =
                    "N/A";

                if (
                    scoreValue !== null &&
                    !Number.isNaN(
                        Number(scoreValue)
                    )
                ) {
                    scoreText =
                        Number(
                            scoreValue
                        ).toFixed(4);
                }

                const noteId =
                    item.id ??
                    item.note_id ??
                    item.note?.id ??
                    null;

                card.innerHTML = `
                    <h3>
                        ${title}
                    </h3>

                    <p>
                        ${content}
                    </p>

                    <div class="score">
                        Similarity Score:
                        <strong>
                            ${scoreText}
                        </strong>
                    </div>
                `;

                if (
                    noteId !== null
                ) {
                    card.style.cursor =
                        "pointer";

                    card.title =
                        "Click to jump to this note";

                    card.addEventListener(
                        "click",
                        () =>
                            scrollToNote(
                                noteId
                            )
                    );
                }

                resultsContainer.appendChild(
                    card
                );
            }
        );
    } catch (error) {
        console.error(
            "AI search error:",
            error
        );

        resultsContainer.innerHTML = `
            <p class="error-text">
                AI Search failed:
                ${escapeHTML(
                    error.message
                )}
            </p>
        `;
    }
}

function setupSmartSearch() {
    const button =
        document.getElementById(
            "smartBtn"
        );

    const input =
        document.getElementById(
            "smartInput"
        );

    if (button) {
        button.addEventListener(
            "click",
            smartSearch
        );
    }

    if (input) {
        input.addEventListener(
            "keydown",
            event => {
                if (
                    event.key === "Enter"
                ) {
                    event.preventDefault();
                    smartSearch();
                }
            }
        );
    }
}

function setupExactTitleSearch() {
    const input =
        document.getElementById(
            "exactTitle"
        );

    const button =
        document.getElementById(
            "findTitle"
        );

    if (button) {
        button.addEventListener(
            "click",
            findExactTitle
        );
    }

    if (input) {
        input.addEventListener(
            "keydown",
            event => {
                if (
                    event.key === "Enter"
                ) {
                    event.preventDefault();
                    findExactTitle();
                }
            }
        );
    }
}

function setupNoteForm() {
    const form =
        document.getElementById(
            "noteForm"
        );

    if (!form) {
        return;
    }

    form.addEventListener(
        "submit",
        handleNoteSubmit
    );
}

function setupKeyboardShortcuts() {
    document.addEventListener(
        "keydown",
        event => {
            if (
                event.key === "Escape" &&
                isEditing
            ) {
                resetNoteForm();
            }
        }
    );
}

async function initializeApp() {
    setupSearch();
    setupSorting();
    setupNoteForm();
    setupQuickTagSearch();
    setupSmartSearch();
    setupExactTitleSearch();
    setupKeyboardShortcuts();

    await loadNotes();
}

document.addEventListener(
    "DOMContentLoaded",
    initializeApp
);