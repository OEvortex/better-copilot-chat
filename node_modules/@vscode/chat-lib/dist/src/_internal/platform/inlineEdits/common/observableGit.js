"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObservableGit = void 0;
const lifecycle_1 = require("../../../util/vs/base/common/lifecycle");
const observable_1 = require("../../../util/vs/base/common/observable");
const gitExtensionService_1 = require("../../git/common/gitExtensionService");
let ObservableGit = class ObservableGit extends lifecycle_1.Disposable {
    constructor(_gitExtensionService) {
        super();
        this._gitExtensionService = _gitExtensionService;
        this._gitApi = (0, observable_1.observableFromEvent)(this, (listener) => this._gitExtensionService.onDidChange(listener), () => this._gitExtensionService.getExtensionApi());
        this.branch = (0, observable_1.observableValue)('branchName', undefined);
        this.init();
    }
    async init() {
        const gitApi = await (0, observable_1.waitForState)(this._gitApi);
        if (this._store.isDisposed) {
            return;
        }
        const repos = (0, observable_1.observableFromEvent)(this, (e) => gitApi.onDidOpenRepository(e), () => gitApi.repositories);
        await (0, observable_1.waitForState)(repos, (repos) => repos.length > 0, undefined);
        if (this._store.isDisposed) {
            return;
        }
        (0, observable_1.mapObservableArrayCached)(this, repos, (repo, store) => {
            const stateChangeObservable = (0, observable_1.observableFromEvent)(listener => repo.state.onDidChange(listener), () => repo.state.HEAD?.name);
            store.add((0, observable_1.autorunWithStore)((reader, _store) => {
                this.branch.set(stateChangeObservable.read(reader), undefined);
            }));
        }, repo => repo.rootUri.toString()).recomputeInitiallyAndOnChange(this._store);
    }
};
exports.ObservableGit = ObservableGit;
exports.ObservableGit = ObservableGit = __decorate([
    __param(0, gitExtensionService_1.IGitExtensionService)
], ObservableGit);
//# sourceMappingURL=observableGit.js.map