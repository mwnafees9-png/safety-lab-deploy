// app.js — COMPOSITION ROOT. The only file that knows the full module list
// (Constitution). A future FuSa Lab is a sibling root with a different spine.
import { registry } from './core/registry.js';
import { shell } from './ui/shell.js';
import { spine } from './spine/en50126.js';

import * as dashboard from './modules/dashboard.js';
import * as sysdef from './modules/sample.js';
import * as hazards from './modules/hazards.js';
import * as thr from './modules/thr.js';
import * as reliability from './modules/reliability.js';
import * as availability from './modules/availability.js';
import * as maintainability from './modules/maintainability.js';
import * as sracs from './modules/sracs.js';
import * as safetycase from './modules/safetycase.js';

[dashboard, sysdef, hazards, thr, reliability, availability, maintainability, sracs, safetycase]
    .forEach(m => registry.register(m.module));

shell.mount(document.body, { spine });
