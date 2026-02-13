"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.INotificationService = exports.NullNotificationService = exports.ProgressLocation = void 0;
const services_1 = require("../../../util/common/services");
const cancellation_1 = require("../../../util/vs/base/common/cancellation");
var ProgressLocation;
(function (ProgressLocation) {
    ProgressLocation[ProgressLocation["SourceControl"] = 1] = "SourceControl";
    ProgressLocation[ProgressLocation["Window"] = 10] = "Window";
    ProgressLocation[ProgressLocation["Notification"] = 15] = "Notification";
})(ProgressLocation || (exports.ProgressLocation = ProgressLocation = {}));
class NullNotificationService {
    showInformationMessage(message, optionsOrItem, ...items) {
        return Promise.resolve(undefined);
    }
    showWarningMessage(message, ...items) {
        return Promise.resolve(undefined);
    }
    showQuotaExceededDialog(options) {
        return Promise.resolve();
    }
    withProgress(options, task) {
        return Promise.resolve(task({ report: () => { } }, cancellation_1.CancellationToken.None));
    }
}
exports.NullNotificationService = NullNotificationService;
exports.INotificationService = (0, services_1.createServiceIdentifier)('INotificationService');
//# sourceMappingURL=notificationService.js.map