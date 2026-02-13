"use strict";
/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TraceIdRatioBasedSampler = exports.SimpleSpanProcessor = exports.SamplingDecision = exports.RandomIdGenerator = exports.ParentBasedSampler = exports.NoopSpanProcessor = exports.InMemorySpanExporter = exports.ConsoleSpanExporter = exports.BatchSpanProcessor = exports.BasicTracerProvider = exports.AlwaysOnSampler = exports.AlwaysOffSampler = exports.sortResources = exports.shouldPropagateTraceHeaders = exports.parseUrl = exports.normalizeUrl = exports.hasKey = exports.getResource = exports.getElementXPath = exports.addSpanNetworkEvents = exports.addSpanNetworkEvent = exports.PerformanceTimingNames = exports.StackContextManager = exports.WebTracerProvider = void 0;
var WebTracerProvider_1 = require("./WebTracerProvider");
Object.defineProperty(exports, "WebTracerProvider", { enumerable: true, get: function () { return WebTracerProvider_1.WebTracerProvider; } });
var StackContextManager_1 = require("./StackContextManager");
Object.defineProperty(exports, "StackContextManager", { enumerable: true, get: function () { return StackContextManager_1.StackContextManager; } });
var PerformanceTimingNames_1 = require("./enums/PerformanceTimingNames");
Object.defineProperty(exports, "PerformanceTimingNames", { enumerable: true, get: function () { return PerformanceTimingNames_1.PerformanceTimingNames; } });
var utils_1 = require("./utils");
Object.defineProperty(exports, "addSpanNetworkEvent", { enumerable: true, get: function () { return utils_1.addSpanNetworkEvent; } });
Object.defineProperty(exports, "addSpanNetworkEvents", { enumerable: true, get: function () { return utils_1.addSpanNetworkEvents; } });
Object.defineProperty(exports, "getElementXPath", { enumerable: true, get: function () { return utils_1.getElementXPath; } });
Object.defineProperty(exports, "getResource", { enumerable: true, get: function () { return utils_1.getResource; } });
Object.defineProperty(exports, "hasKey", { enumerable: true, get: function () { return utils_1.hasKey; } });
Object.defineProperty(exports, "normalizeUrl", { enumerable: true, get: function () { return utils_1.normalizeUrl; } });
Object.defineProperty(exports, "parseUrl", { enumerable: true, get: function () { return utils_1.parseUrl; } });
Object.defineProperty(exports, "shouldPropagateTraceHeaders", { enumerable: true, get: function () { return utils_1.shouldPropagateTraceHeaders; } });
Object.defineProperty(exports, "sortResources", { enumerable: true, get: function () { return utils_1.sortResources; } });
var sdk_trace_base_1 = require("@opentelemetry/sdk-trace-base");
Object.defineProperty(exports, "AlwaysOffSampler", { enumerable: true, get: function () { return sdk_trace_base_1.AlwaysOffSampler; } });
Object.defineProperty(exports, "AlwaysOnSampler", { enumerable: true, get: function () { return sdk_trace_base_1.AlwaysOnSampler; } });
Object.defineProperty(exports, "BasicTracerProvider", { enumerable: true, get: function () { return sdk_trace_base_1.BasicTracerProvider; } });
Object.defineProperty(exports, "BatchSpanProcessor", { enumerable: true, get: function () { return sdk_trace_base_1.BatchSpanProcessor; } });
Object.defineProperty(exports, "ConsoleSpanExporter", { enumerable: true, get: function () { return sdk_trace_base_1.ConsoleSpanExporter; } });
Object.defineProperty(exports, "InMemorySpanExporter", { enumerable: true, get: function () { return sdk_trace_base_1.InMemorySpanExporter; } });
Object.defineProperty(exports, "NoopSpanProcessor", { enumerable: true, get: function () { return sdk_trace_base_1.NoopSpanProcessor; } });
Object.defineProperty(exports, "ParentBasedSampler", { enumerable: true, get: function () { return sdk_trace_base_1.ParentBasedSampler; } });
Object.defineProperty(exports, "RandomIdGenerator", { enumerable: true, get: function () { return sdk_trace_base_1.RandomIdGenerator; } });
Object.defineProperty(exports, "SamplingDecision", { enumerable: true, get: function () { return sdk_trace_base_1.SamplingDecision; } });
Object.defineProperty(exports, "SimpleSpanProcessor", { enumerable: true, get: function () { return sdk_trace_base_1.SimpleSpanProcessor; } });
Object.defineProperty(exports, "TraceIdRatioBasedSampler", { enumerable: true, get: function () { return sdk_trace_base_1.TraceIdRatioBasedSampler; } });
//# sourceMappingURL=index.js.map