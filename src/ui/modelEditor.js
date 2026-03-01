/**
 * Model Editor - Client Script
 * Responsible for DOM creation, event binding and communication with VSCode
 */

// VSCode API
const vscode = acquireVsCodeApi();

// Type definitions
/**
 * @typedef {Object} Provider
 * @property {string} id - Provider ID
 * @property {string} name - Provider Name
 */

/**
 * @typedef {Object} ModelCapabilities
 * @property {boolean} toolCalling - Whether tool calling is supported
 * @property {boolean} imageInput - Whether image input is supported
 */

/**
 * @typedef {Object} ModelData
 * @property {string} id - Model ID
 * @property {string} name - Display Name
 * @property {string} [tooltip] - Description (optional)
 * @property {string} provider - Provider identifier
 * @property {string} [baseUrl] - API base URL (optional)
 * @property {string} [model] - Request model ID (optional)
 * @property {'openai'|'anthropic'|'gemini'} sdkMode - SDK compatibility mode
 * @property {number} maxInputTokens - Maximum input tokens
 * @property {number} maxOutputTokens - Maximum output tokens
 * @property {ModelCapabilities} capabilities - Capability configuration
 * @property {boolean} outputThinking - Whether to show thinking process in chat interface (recommended for thinking models)
 * @property {boolean} includeThinking - Whether to inject thinking content into context for multi-turn conversations (required for thinking models)
 * @property {Object} [customHeader] - Custom HTTP header (optional)
 * @property {Object} [extraBody] - Extra request body parameters (optional)
 */

// Global variables
/** @type {Provider[]} */
let allProviders = [];
/** @type {ModelData} */
let modelData = {};
/** @type {boolean} */
let isCreateMode = false;

/**
 * Initialize editor
 * @param {ModelData} data - Model data
 * @param {boolean} createMode - Whether it is in creation mode
 * @returns {void}
 */
function _initializeEditor(data, createMode) {
	modelData = data;
	isCreateMode = createMode;

	// Create DOM
	createDOM();

	// Bind events
	bindEvents();

	// Request providers list
	vscode.postMessage({ command: "getProviders" });

	// Initialize JSON validation
	validateJSON_UI("customHeader");
	validateJSON_UI("extraBody");
}

/**
 * Create DOM structure
 * @returns {void}
 */
function createDOM() {
	const container = document.getElementById("app");

	// Create basic information section
	const basicSection = createSection("Basic Information", [
		createFormGroup(
			"modelId",
			`Model ID${isCreateMode ? " *" : ""}`,
			"id",
			"input",
			{
				type: "text",
				placeholder: "Example: zhipu:glm-4.6",
				value: modelData.id,
				readonly: !isCreateMode,
			},
			isCreateMode
				? "Unique model identifier, cannot be changed after creation"
				: "Unique model identifier, cannot be changed, please edit config file directly if modification needed.",
		),
		createFormGroup(
			"modelName",
			"Display Name *",
			"name",
			"input",
			{
				type: "text",
				placeholder: "Example: GLM-4.6 (Zhipu AI)",
				value: modelData.name,
			},
			"Name displayed in model selector",
		),
		createFormGroup(
			"modelTooltip",
			"Description",
			"tooltip",
			"textarea",
			{
				rows: 2,
				placeholder: "Detailed model description (optional)",
				value: modelData.tooltip,
			},
			"Tooltip displayed on hover",
		),
		createFormGroup(
			"requestModel",
			"Request Model ID",
			"model",
			"input",
			{
				type: "text",
				placeholder: "Example: gpt-4",
				value: modelData.model,
			},
			"Model ID used when making requests (optional), uses Model ID (id) value if left empty",
		),
	]);

	// Create API configuration section
	const apiSection = createSection("API Configuration", [
		createProviderFormGroup(),
		createFormGroup(
			"sdkMode",
			"SDK Mode",
			"sdkMode",
			"select",
			{
				options: [
					{
						value: "openai",
						label:
							"OpenAI SDK (use official SDK for streaming data processing)",
						selected: modelData.sdkMode === "openai",
					},
					{
						value: "anthropic",
						label:
							"Anthropic SDK (use official SDK for streaming data processing)",
						selected: modelData.sdkMode === "anthropic",
					},
					{
						value: "gemini",
						label:
							"Gemini SDK (use Gemini-compatible request and streaming format)",
						selected: modelData.sdkMode === "gemini",
					},
				],
			},
			"Compatibility mode used for model communication",
		),
		createFormGroup(
			"baseUrl",
			"BASE URL *",
			"baseUrl",
			"input",
			{
				type: "url",
				placeholder:
					"Example: https://api.openai.com/v1 or https://api.anthropic.com",
				value: modelData.baseUrl,
			},
			"Base URL address for API requests, must start with http:// or https://\nExample: https://api.openai.com/v1 or https://api.anthropic.com",
		),
	]);

	// Create performance settings section
	const perfSection = createSection("Model Performance", [
		createFormGroup(
			"maxInputTokens",
			"Max Input Tokens",
			"maxInputTokens",
			"input",
			{
				type: "number",
				min: 128,
				value: modelData.maxInputTokens,
			},
			"Maximum input context limit supported by the model",
		),
		createFormGroup(
			"maxOutputTokens",
			"Max Output Tokens",
			"maxOutputTokens",
			"input",
			{
				type: "number",
				min: 8,
				value: modelData.maxOutputTokens,
			},
			"Maximum output token limit supported by the model",
		),
	]);

	// Create capability configuration section
	const capSection = createSection("Model Capabilities", [
		createCheckboxFormGroup(
			"toolCalling",
			"Support Tool Calling",
			"capabilities.toolCalling",
			modelData.toolCalling,
		),
		createCheckboxFormGroup(
			"imageInput",
			"Support Image Input",
			"capabilities.imageInput",
			modelData.imageInput,
		),
	]);

	// Create advanced settings section
	const advSection = createSection("Advanced Settings", [
		createCheckboxFormGroup(
			"outputThinking",
			"Show Thinking Process in Chat UI",
			"outputThinking",
			modelData.outputThinking,
			"Display model's thinking process in chat interface. Enable this to see <thinking> tags in responses. Recommended for thinking models like Claude Sonnet/Opus 4.5.",
		),
		createCheckboxFormGroup(
			"includeThinking",
			"Inject Thinking into Multi-turn Conversations",
			"includeThinking",
			modelData.includeThinking,
			"Include thinking content when sending conversation history to model. Required for thinking models to maintain context. Enable this for Claude Sonnet/Opus 4.5 thinking models.",
		),
		createJSONFormGroup(
			"customHeader",
			"Custom HTTP Header (JSON format)",
			"customHeader",
			modelData.customHeader,
			'{"Authorization": "Bearer ${APIKEY}", "X-Custom-Header": "value"}',
			"Optional custom HTTP header configuration. Supports ${APIKEY} placeholder to auto-replace with actual API key.",
		),
		createJSONFormGroup(
			"extraBody",
			"Extra Request Body Parameters (JSON format)",
			"extraBody",
			modelData.extraBody,
			'{"temperature": 1, "top_p": null}',
			"Extra request body parameters, will be merged into request body in API. If model doesn't support certain parameters, can set to null to remove corresponding values.",
		),
	]);

	// Create button group
	const buttonGroup = createButtonGroup();

	// Create global error banner
	const errorBanner = createErrorBanner();

	// Add to container (error banner at the very top)
	container.appendChild(errorBanner);
	container.appendChild(basicSection);
	container.appendChild(apiSection);
	container.appendChild(perfSection);
	container.appendChild(capSection);
	container.appendChild(advSection);
	container.appendChild(buttonGroup);
}

/**
 * Create section element
 * @param {string} title - Section title
 * @param {Array<HTMLElement>} formGroups - Array of form group elements
 * @returns {HTMLElement} Created section element
 */
function createSection(title, formGroups) {
	const section = document.createElement("div");
	section.className = "section";

	const h3 = document.createElement("h3");
	h3.textContent = title;
	section.appendChild(h3);

	for (const group of formGroups) {
		section.appendChild(group);
	}

	return section;
}

/**
 * Create form group
 * @param {string} id - ID of the form element
 * @param {string} labelText - Label display text
 * @param {string} fieldName - Field name (displayed in parentheses)
 * @param {string} elementType - Element type: 'input', 'textarea' or 'select'
 * @param {Object} attrs - Element attributes object
 * @param {string} [helpText] - Help text (optional)
 * @returns {HTMLElement} Created form group element
 */
function createFormGroup(
	id,
	labelText,
	fieldName,
	elementType,
	attrs,
	helpText,
) {
	const group = document.createElement("div");
	group.className = "form-group";

	const label = document.createElement("label");
	label.htmlFor = id;
	label.innerHTML = `${labelText} <span class="field-name">(${fieldName})</span>`;
	group.appendChild(label);

	let element;
	if (elementType === "input") {
		element = document.createElement("input");
		Object.entries(attrs).forEach(([key, value]) => {
			if (key === "readonly" && value) {
				element.setAttribute("readonly", "");
				element.classList.add("readonly");
			} else if (key !== "readonly") {
				element.setAttribute(key, value || "");
			}
		});
	} else if (elementType === "textarea") {
		element = document.createElement("textarea");
		Object.entries(attrs).forEach(([key, value]) => {
			if (key === "value") {
				element.textContent = value || "";
			} else {
				element.setAttribute(key, value || "");
			}
		});
	} else if (elementType === "select") {
		element = document.createElement("select");
		attrs.options.forEach((opt) => {
			const option = document.createElement("option");
			option.value = opt.value;
			option.textContent = opt.label;
			if (opt.selected) option.selected = true;
			element.appendChild(option);
		});
	}

	element.id = id;
	group.appendChild(element);

	if (helpText) {
		const help = document.createElement("div");
		help.className = "help-text detailed";
		help.textContent = helpText;
		group.appendChild(help);
	}

	return group;
}

/**
 * Create checkbox form group
 * @param {string} id - ID of the checkbox element
 * @param {string} labelText - Label display text
 * @param {string} fieldName - Field name (displayed in parentheses)
 * @param {boolean} checked - Whether the checkbox is checked
 * @param {string} [detailedHelp] - Detailed help text (optional)
 * @returns {HTMLElement} Created checkbox form group element
 */
function createCheckboxFormGroup(
	id,
	labelText,
	fieldName,
	checked,
	detailedHelp,
) {
	const group = document.createElement("div");
	group.className = "form-group";

	const checkboxGroup = document.createElement("div");
	checkboxGroup.className = "checkbox-group";

	const checkbox = document.createElement("input");
	checkbox.type = "checkbox";
	checkbox.id = id;
	checkbox.checked = checked || false;

	const label = document.createElement("label");
	label.htmlFor = id;
	label.innerHTML = `${labelText} <span class="field-name">(${fieldName})</span>`;

	checkboxGroup.appendChild(checkbox);
	checkboxGroup.appendChild(label);
	group.appendChild(checkboxGroup);

	if (detailedHelp) {
		const help = document.createElement("div");
		help.className = "help-text detailed";
		help.textContent = detailedHelp;
		group.appendChild(help);
	} else {
		group.classList.add("no-bottom");
	}

	return group;
}

/**
 * Create provider form group
 * @returns {HTMLElement} Created provider form group element
 */
function createProviderFormGroup() {
	const group = document.createElement("div");
	group.className = "form-group";

	const label = document.createElement("label");
	label.htmlFor = "provider";
	label.innerHTML = 'Provider * <span class="field-name">(provider)</span>';
	group.appendChild(label);

	const dropdown = document.createElement("div");
	dropdown.className = "provider-dropdown";

	const input = document.createElement("input");
	input.type = "text";
	input.id = "provider";
	input.className = "provider-input";
	input.value = modelData.provider;
	input.placeholder = "Example: zhipu";
	input.autocomplete = "off";

	const list = document.createElement("div");
	list.className = "provider-list";
	list.id = "providerList";

	dropdown.appendChild(input);
	dropdown.appendChild(list);
	group.appendChild(dropdown);

	const help = document.createElement("div");
	help.className = "help-text";
	help.textContent =
		"Model provider identifier (can select built-in/known providers or custom input)";
	group.appendChild(help);

	return group;
}

/**
 * Create JSON form group
 * @param {string} id - ID of the form element
 * @param {string} labelText - Label display text
 * @param {string} fieldName - Field name (displayed in parentheses)
 * @param {string} value - JSON string value
 * @param {string} placeholder - Placeholder text
 * @param {string} helpText - Help text
 * @returns {HTMLElement} Created JSON form group element
 */
function createJSONFormGroup(
	id,
	labelText,
	fieldName,
	value,
	placeholder,
	helpText,
) {
	const group = document.createElement("div");
	group.className = "form-group";

	const label = document.createElement("label");
	label.htmlFor = id;
	label.innerHTML = `${labelText} <span class="field-name">(${fieldName})</span>`;
	group.appendChild(label);

	const container = document.createElement("div");
	container.className = "json-container";

	const toolbar = document.createElement("div");
	toolbar.className = "json-toolbar";

	const formatBtn = document.createElement("button");
	formatBtn.type = "button";
	formatBtn.className = "json-button";
	formatBtn.textContent = "Format";
	formatBtn.onclick = (e) => {
		e.preventDefault();
		formatJSON(id);
	};

	const clearBtn = document.createElement("button");
	clearBtn.type = "button";
	clearBtn.className = "json-button";
	clearBtn.textContent = "Clear";
	clearBtn.onclick = (e) => {
		e.preventDefault();
		clearJSON(id);
	};

	const status = document.createElement("div");
	status.className = "json-status";
	status.id = `${id}Status`;

	const indicator = document.createElement("span");
	indicator.className = "json-status-indicator";

	const statusText = document.createElement("span");
	statusText.id = `${id}StatusText`;
	statusText.textContent = "No content";

	status.appendChild(indicator);
	status.appendChild(statusText);

	toolbar.appendChild(formatBtn);
	toolbar.appendChild(clearBtn);
	toolbar.appendChild(status);
	container.appendChild(toolbar);

	const textarea = document.createElement("textarea");
	textarea.id = id;
	textarea.className = "json-input";
	textarea.placeholder = placeholder;
	textarea.value = value || "";

	container.appendChild(textarea);

	const error = document.createElement("div");
	error.className = "json-error";
	error.id = `${id}Error`;
	container.appendChild(error);

	group.appendChild(container);

	const help = document.createElement("div");
	help.className = "help-text detailed";
	help.textContent = helpText;
	group.appendChild(help);

	return group;
}

/**
 * Create global error notification area
 * @returns {HTMLElement} Created error notification element
 */
function createErrorBanner() {
	const banner = document.createElement("div");
	banner.id = "globalErrorBanner";
	banner.className = "error-banner";
	banner.style.display = "none";

	const messageSpan = document.createElement("span");
	messageSpan.id = "globalErrorMessage";

	const closeBtn = document.createElement("button");
	closeBtn.className = "error-banner-close";
	closeBtn.textContent = "×";
	closeBtn.onclick = hideGlobalError;

	banner.appendChild(messageSpan);
	banner.appendChild(closeBtn);

	return banner;
}

/**
 * Create button group
 * @returns {HTMLElement} Created button group element
 */
function createButtonGroup() {
	const group = document.createElement("div");
	group.className = "button-group";

	// Create internal container for center alignment
	const inner = document.createElement("div");
	inner.className = "button-group-inner";

	// Left buttons container (Delete button)
	const leftButtons = document.createElement("div");
	leftButtons.style.display = "flex";
	leftButtons.style.gap = "10px";

	// Right buttons container (Save and Cancel buttons)
	const rightButtons = document.createElement("div");
	rightButtons.style.display = "flex";
	rightButtons.style.gap = "10px";

	// If in edit mode, add delete button to the left
	if (!isCreateMode) {
		const deleteBtn = document.createElement("button");
		deleteBtn.className = "delete-button";
		deleteBtn.textContent = "Delete";
		deleteBtn.onclick = deleteModel;
		leftButtons.appendChild(deleteBtn);
	}

	const saveBtn = document.createElement("button");
	saveBtn.className = "primary-button";
	saveBtn.textContent = isCreateMode ? "Create" : "Update";
	saveBtn.onclick = saveModel;

	const cancelBtn = document.createElement("button");
	cancelBtn.className = "secondary-button";
	cancelBtn.textContent = "Cancel";
	cancelBtn.onclick = cancelEdit;

	rightButtons.appendChild(saveBtn);
	rightButtons.appendChild(cancelBtn);

	inner.appendChild(leftButtons);
	inner.appendChild(rightButtons);
	group.appendChild(inner);

	return group;
}

/**
 * Automatically adjust height of a single textarea to fit content
 * @param {HTMLTextAreaElement} textarea - textarea element
 * @returns {void}
 */
function autoResizeTextarea(textarea) {
	if (!textarea) return;

	// Reset height to get correct scrollHeight
	textarea.style.height = "auto";

	// Set new height (scrollHeight + border)
	const newHeight = textarea.scrollHeight;
	textarea.style.height = `${newHeight}px`;
}

/**
 * Add auto-expanding height functionality to all textarea elements
 * @returns {void}
 */
function autoResizeAllTextareas() {
	const textareas = document.querySelectorAll("textarea");

	textareas.forEach((textarea) => {
		// Adjust height once during initialization
		autoResizeTextarea(textarea);

		// Listen to input events, adjust height in real time
		textarea.addEventListener("input", function () {
			autoResizeTextarea(this);
		});

		// Listen to change events (e.g. after pasting)
		textarea.addEventListener("change", function () {
			autoResizeTextarea(this);
		});

		// Listen to paste events
		textarea.addEventListener("paste", function () {
			// Use setTimeout to ensure content has been pasted
			setTimeout(() => {
				autoResizeTextarea(this);
			}, 0);
		});
	});
}

/**
 * General input validation - non-empty validation
 * @param {HTMLElement} element - Input element to validate
 * @returns {void}
 */
function addSimpleValidation(element) {
	element.addEventListener("input", function () {
		if (this.value.trim()) {
			this.classList.remove("invalid");
		} else {
			this.classList.add("invalid");
		}
	});
}

/**
 * General number validation - must be a positive integer
 * @param {HTMLElement} element - Input element to validate
 * @returns {void}
 */
function addNumberValidation(element) {
	element.addEventListener("input", function () {
		const value = parseInt(this.value, 10);
		if (value && value > 0) {
			this.classList.remove("invalid");
		} else {
			this.classList.add("invalid");
		}
	});
}

/**
 * Check if it is a valid JSON object (not an array, not null, not a primitive type)
 * @param {*} parsed - Parsed JSON data
 * @returns {boolean} Whether it is a valid JSON object
 */
function isValidJSONObject(parsed) {
	return (
		typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
	);
}

/**
 * Bind event listeners
 * @returns {void}
 */
function bindEvents() {
	// Real-time validation for required fields
	const modelId = document.getElementById("modelId");
	const modelName = document.getElementById("modelName");
	const provider = document.getElementById("provider");
	const baseUrl = document.getElementById("baseUrl");
	const maxInputTokens = document.getElementById("maxInputTokens");
	const maxOutputTokens = document.getElementById("maxOutputTokens");

	// Add auto-expanding height functionality to all textarea elements
	autoResizeAllTextareas();

	// Model ID validation
	if (modelId && !modelId.readOnly) {
		addSimpleValidation(modelId);
	}

	// Display name validation
	addSimpleValidation(modelName);

	// Provider validation
	addSimpleValidation(provider);

	// baseUrl validation (required + URL format)
	baseUrl.addEventListener("input", function () {
		const value = this.value.trim();
		if (!value) {
			this.classList.add("invalid");
			return;
		}
		try {
			const urlObj = new URL(value);
			if (urlObj.protocol === "http:" || urlObj.protocol === "https:") {
				this.classList.remove("invalid");
			} else {
				this.classList.add("invalid");
			}
		} catch (_e) {
			this.classList.add("invalid");
		}
	});

	// Token count validation
	addNumberValidation(maxInputTokens);
	addNumberValidation(maxOutputTokens);

	// JSON validation events
	const customHeader = document.getElementById("customHeader");
	const extraBody = document.getElementById("extraBody");

	customHeader.addEventListener("input", () => validateJSON_UI("customHeader"));
	customHeader.addEventListener("change", () =>
		validateJSON_UI("customHeader"),
	);

	extraBody.addEventListener("input", () => validateJSON_UI("extraBody"));
	extraBody.addEventListener("change", () => validateJSON_UI("extraBody"));

	// Provider input events
	const providerInput = document.getElementById("provider");
	const providerList = document.getElementById("providerList");

	providerInput.addEventListener("input", function () {
		const searchText = this.value.toLowerCase();
		if (searchText) {
			const filtered = allProviders.filter(
				(p) =>
					p.id.toLowerCase().includes(searchText) ||
					p.name.toLowerCase().includes(searchText),
			);
			renderProviderList(filtered);
			providerList.classList.add("show");
		} else {
			providerList.classList.remove("show");
		}
	});

	providerInput.addEventListener("focus", () => {
		if (allProviders && allProviders.length > 0) {
			renderProviderList(allProviders);
			providerList.classList.add("show");
		}
	});

	document.addEventListener("click", (event) => {
		if (!event.target.closest(".provider-dropdown")) {
			providerList.classList.remove("show");
		}
	});

	// VSCode message events
	window.addEventListener("message", (event) => {
		const message = event.data;
		if (message.command === "setProviders") {
			updateProviderList(message.providers);
		}
	});
}

/**
 * Validate JSON string format
 * @param {string} jsonString - JSON string to validate
 * @returns {boolean} Whether JSON is valid
 */
function validateJSON(jsonString) {
	if (!jsonString || jsonString.trim() === "") {
		return true;
	}
	try {
		const parsed = JSON.parse(jsonString);
		// Must be object type, cannot be array, string, number, etc.
		return isValidJSONObject(parsed);
	} catch (_e) {
		return false;
	}
}

/**
 * Parse JSON string
 * @param {string} jsonString - JSON string to parse
 * @returns {Object|undefined} Parsed object, returns undefined if parsing fails or not an object
 */
function parseJSON(jsonString) {
	if (!jsonString || jsonString.trim() === "") {
		return undefined;
	}
	try {
		const parsed = JSON.parse(jsonString);
		// Must be object type, cannot be array, string, number, etc.
		if (isValidJSONObject(parsed)) {
			return parsed;
		}
		return undefined;
	} catch (_e) {
		return undefined;
	}
}

/**
 * Validate JSON and update UI state (visual feedback only, does not take focus)
 * @param {string} fieldId - Form field ID
 * @returns {boolean} Whether JSON is valid
 */
function validateJSON_UI(fieldId) {
	const textarea = document.getElementById(fieldId);
	const statusDiv = document.getElementById(`${fieldId}Status`);
	const statusText = document.getElementById(`${fieldId}StatusText`);
	const errorDiv = document.getElementById(`${fieldId}Error`);
	const content = textarea.value.trim();

	// Remove all validation state classes
	textarea.classList.remove("json-valid", "json-invalid");
	if (errorDiv) {
		errorDiv.classList.remove("show");
	}

	if (!content) {
		const indicator = statusDiv.querySelector(".json-status-indicator");
		indicator.className = "json-status-indicator";
		statusText.textContent = "No content";
		return true;
	}

	try {
		const parsed = JSON.parse(content);
		// Must be object type, consistent with validateJSON logic
		if (isValidJSONObject(parsed)) {
			// Validation passed - restore default state (no green style added)
			const indicator = statusDiv.querySelector(".json-status-indicator");
			indicator.className = "json-status-indicator";
			statusText.textContent = "Valid";
			return true;
		} else {
			// Not an object type - show red error state
			textarea.classList.add("json-invalid");
			const indicator = statusDiv.querySelector(".json-status-indicator");
			indicator.className = "json-status-indicator invalid";
			statusText.textContent = "Invalid";
			if (errorDiv) {
				errorDiv.textContent =
					'Must be object type (like {"key": "value"}), cannot be array, number or string';
				errorDiv.classList.add("show");
			}
			return false;
		}
	} catch (e) {
		// JSON parsing error - show red error state
		textarea.classList.add("json-invalid");
		const indicator = statusDiv.querySelector(".json-status-indicator");
		indicator.className = "json-status-indicator invalid";
		statusText.textContent = "Invalid";
		if (errorDiv) {
			errorDiv.textContent = `Error: ${e.message}`;
			errorDiv.classList.add("show");
		}
		return false;
	}
}

/**
 * Format JSON string
 * @param {string} fieldId - Form field ID
 * @returns {void}
 */
function formatJSON(fieldId) {
	const textarea = document.getElementById(fieldId);
	const content = textarea.value.trim();

	if (!content) {
		showGlobalError("No content to format");
		return;
	}

	try {
		const parsed = JSON.parse(content);
		// Must be object type, consistent with validateJSON logic
		if (!isValidJSONObject(parsed)) {
			showGlobalError(
				'JSON format error: Must be object type (like {"key": "value"}), cannot be array, number or string',
			);
			return;
		}
		textarea.value = JSON.stringify(parsed, null, 2);
		validateJSON_UI(fieldId);
		// Adjust height after formatting
		autoResizeTextarea(textarea);
		textarea.style.opacity = "0.7";
		setTimeout(() => {
			textarea.style.opacity = "1";
		}, 200);
		// Clear error prompt when formatting is successful
		hideGlobalError();
	} catch (e) {
		showGlobalError(`JSON format error, cannot format:\n${e.message}`);
	}
}

/**
 * Clear JSON field content
 * @param {string} fieldId - Form field ID
 * @returns {void}
 */
function clearJSON(fieldId) {
	const textarea = document.getElementById(fieldId);
	// Clear directly without confirmation (user can restore via cancel save or Ctrl+Z)
	textarea.value = "";
	validateJSON_UI(fieldId);
	// Adjust height after clearing
	autoResizeTextarea(textarea);
}

/**
 * Provider list management
 * @param {Provider[]} providers - Provider list
 * @returns {void}
 */
function updateProviderList(providers) {
	allProviders = providers || [];
	renderProviderList(allProviders);
}

/**
 * Render provider list
 * @param {Provider[]} providers - Provider list
 * @returns {void}
 */
function renderProviderList(providers) {
	const providerListDiv = document.getElementById("providerList");
	const currentValue = document.getElementById("provider").value;

	providerListDiv.innerHTML = "";

	if (!providers || providers.length === 0) {
		const item = document.createElement("div");
		item.className = "provider-list-item";
		item.textContent = "No matching providers";
		item.style.pointerEvents = "none";
		item.style.opacity = "0.5";
		providerListDiv.appendChild(item);
		return;
	}

	providers.forEach((provider) => {
		const item = document.createElement("div");
		item.className = "provider-list-item";
		if (provider.id === currentValue) {
			item.classList.add("selected");
		}
		item.textContent = `${provider.name} (${provider.id})`;
		item.addEventListener("click", () => {
			const providerInput = document.getElementById("provider");
			providerInput.value = provider.id;
			// Remove error style (if any)
			providerInput.classList.remove("invalid");
			providerListDiv.classList.remove("show");
		});
		providerListDiv.appendChild(item);
	});
}

/**
 * Form validation
 */
/**
 * Show global error info
 * @param {string} message - Error message
 * @returns {void}
 */
function showGlobalError(message) {
	const banner = document.getElementById("globalErrorBanner");
	const messageSpan = document.getElementById("globalErrorMessage");

	if (banner && messageSpan) {
		messageSpan.textContent = message;
		banner.style.display = "flex";
		// Auto-scroll to top to ensure user sees error prompt
		banner.scrollIntoView({ behavior: "smooth", block: "nearest" });
	}
}

/**
 * Hide global error info
 * @returns {void}
 */
function hideGlobalError() {
	const banner = document.getElementById("globalErrorBanner");
	if (banner) {
		banner.style.display = "none";
	}
}

/**
 * Validate form data
 * @returns {boolean} Whether form is valid
 */
function validateForm() {
	const modelId = document.getElementById("modelId").value.trim();
	const modelName = document.getElementById("modelName").value.trim();
	const provider = document.getElementById("provider").value.trim();
	const baseUrl = document.getElementById("baseUrl").value.trim();
	const maxInputTokens = document.getElementById("maxInputTokens").value.trim();
	const maxOutputTokens = document
		.getElementById("maxOutputTokens")
		.value.trim();

	// Validate required fields
	if (!modelId) {
		showGlobalError("Please enter Model ID");
		document.getElementById("modelId").focus();
		return false;
	}
	if (!modelName) {
		showGlobalError("Please enter display name");
		document.getElementById("modelName").focus();
		return false;
	}
	if (!provider) {
		showGlobalError("Please enter provider");
		document.getElementById("provider").focus();
		return false;
	}
	if (!baseUrl) {
		showGlobalError("Please enter BASE URL");
		document.getElementById("baseUrl").focus();
		return false;
	}

	// Validate URL format
	if (baseUrl) {
		try {
			const urlObj = new URL(baseUrl);
			if (urlObj.protocol !== "http:" && urlObj.protocol !== "https:") {
				showGlobalError("BASE URL must start with http:// or https://");
				document.getElementById("baseUrl").focus();
				return false;
			}
		} catch (_e) {
			showGlobalError("BASE URL format is incorrect, please enter a valid URL");
			document.getElementById("baseUrl").focus();
			return false;
		}
	}

	// Validate token count
	if (
		!maxInputTokens ||
		Number.isNaN(parseInt(maxInputTokens, 10)) ||
		parseInt(maxInputTokens, 10) <= 0
	) {
		showGlobalError("Input token must be a number greater than 0");
		document.getElementById("maxInputTokens").focus();
		return false;
	}
	if (
		!maxOutputTokens ||
		Number.isNaN(parseInt(maxOutputTokens, 10)) ||
		parseInt(maxOutputTokens, 10) <= 0
	) {
		showGlobalError("Output token must be a number greater than 0");
		document.getElementById("maxOutputTokens").focus();
		return false;
	}

	// Validate JSON format
	const customHeaderJson = document.getElementById("customHeader").value.trim();
	if (customHeaderJson && !validateJSON(customHeaderJson)) {
		showGlobalError(
			"Custom HTTP header JSON format is incorrect, must be object type",
		);
		document.getElementById("customHeader").focus();
		return false;
	}

	const extraBodyJson = document.getElementById("extraBody").value.trim();
	if (extraBodyJson && !validateJSON(extraBodyJson)) {
		showGlobalError(
			"Extra request body parameters JSON format is incorrect, must be object type",
		);
		document.getElementById("extraBody").focus();
		return false;
	}

	return true;
}

/**
 * Save model configuration
 * @returns {void}
 */
function saveModel() {
	// Clear previous errors
	hideGlobalError();

	if (!validateForm()) {
		return;
	}

	const modelId = document.getElementById("modelId").value.trim();
	const modelName = document.getElementById("modelName").value.trim();
	const provider = document.getElementById("provider").value.trim();

	if (!modelId || !modelName || !provider) {
		showGlobalError("Please enter all required fields");
		return;
	}

	const tooltipText = document.getElementById("modelTooltip").value.trim();
	const requestModelText = document.getElementById("requestModel").value.trim();
	const baseUrlText = document.getElementById("baseUrl").value.trim();

	const model = {
		id: modelId,
		name: modelName,
		// tooltip: use null to clear (undefined will be ignored when JSON serializing)
		tooltip: tooltipText || null,
		provider: provider,
		// baseUrl: use null to clear
		baseUrl: baseUrlText || null,
		// model: use null to clear
		model: requestModelText || null,
		sdkMode: document.getElementById("sdkMode").value || "openai",
		maxInputTokens:
			parseInt(document.getElementById("maxInputTokens").value, 10) || 12800,
		maxOutputTokens:
			parseInt(document.getElementById("maxOutputTokens").value, 10) || 8192,
		capabilities: {
			toolCalling: document.getElementById("toolCalling").checked,
			imageInput: document.getElementById("imageInput").checked,
		},
		outputThinking: document.getElementById("outputThinking").checked,
		includeThinking: document.getElementById("includeThinking").checked,
	};

	const customHeaderText = document.getElementById("customHeader").value.trim();
	const customHeader = parseJSON(customHeaderText);
	// Explicitly set customHeader, use null to clear (undefined will be ignored when JSON serializing)
	model.customHeader = customHeader || null;

	const extraBodyText = document.getElementById("extraBody").value.trim();
	const extraBody = parseJSON(extraBodyText);
	// Explicitly set extraBody, use null to clear
	model.extraBody = extraBody || null;

	if (!model.id || !model.name || !model.provider) {
		showGlobalError("Model configuration is incomplete, please try again");
		return;
	}

	vscode.postMessage({
		command: "save",
		model: model,
	});
}

/**
 * Cancel editing
 * @returns {void}
 */
function cancelEdit() {
	vscode.postMessage({
		command: "cancel",
	});
}

/**
 * Delete model
 * @returns {void}
 */
function deleteModel() {
	// Send delete request to VSCode side, VSCode will show confirmation dialog
	vscode.postMessage({
		command: "delete",
		modelId: document.getElementById("modelId").value.trim(),
		modelName: document.getElementById("modelName").value.trim(),
	});
}
