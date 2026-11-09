let nextSourceId = 1;

export const sources = new Map();

function addSource(fn, delay) {
    const id = nextSourceId++;
    sources.set(id, { fn, delay });
    return id;
}

export function runSources() {
    for (const [id, { fn }] of [...sources]) {
        if (sources.delete(id)) fn();
    }
}

export const GLib = {
    PRIORITY_DEFAULT: 0,
    SOURCE_REMOVE: false,
    timeout_add: (_priority, ms, fn) => addSource(fn, ms),
    timeout_add_seconds: (_priority, seconds, fn) =>
        addSource(fn, seconds * 1000),
    idle_add: (_priority, fn) => addSource(fn, 0),
    Source: { remove: (id) => sources.delete(id) },
};

class PropertyTransition {
    constructor({ property_name }) {
        this.property_name = property_name;
    }
    set_from(value) {
        this.from = value;
    }
    set_to(value) {
        this.to = value;
    }
    set_duration(value) {
        this.duration = value;
    }
    set_progress_mode(value) {
        this.mode = value;
    }
    set_remove_on_complete(value) {
        this.removeOnComplete = value;
    }
}

export const Clutter = {
    PropertyTransition,
    AnimationMode: { EASE_OUT_QUAD: 1, EASE_IN_QUAD: 2 },
    PickMode: { REACTIVE: 1 },
    EVENT_PROPAGATE: false,
    BUTTON_PRIMARY: 1,
    EventType: { TOUCH_BEGIN: 1 },
};

let nextHandlerId = 1;

export class Signals {
    handlers = new Map();

    connect(signal, handler) {
        const id = nextHandlerId++;
        this.handlers.set(id, { signal, handler });
        return id;
    }

    disconnect(id) {
        if (!this.handlers.delete(id)) {
            throw new Error(`No handler ${id}`);
        }
    }

    emit(signal, ...args) {
        for (const entry of [...this.handlers.values()]) {
            if (entry.signal === signal) entry.handler(this, ...args);
        }
    }

    connectedTo(signal) {
        return [...this.handlers.values()].filter((h) => h.signal === signal)
            .length;
    }
}

export class Widget extends Signals {
    visible = true;
    onStage = true;
    opacity = 255;
    translationX = 0;
    accessible_name = "";
    transitions = new Map();
    children = [];
    styleClass = "";
    style = null;

    get firstChild() {
        return this.children[0] ?? null;
    }

    is_mapped() {
        return this.onStage && this.visible;
    }

    get_children() {
        return [...this.children];
    }

    set_translation(x) {
        this.translationX = x;
    }

    add_transition(name, transition) {
        this.transitions.set(name, transition);
    }

    remove_all_transitions() {
        this.transitions.clear();
    }

    has_style_class_name(name) {
        return this.styleClass.split(/\s+/).includes(name);
    }

    get_style_class_name() {
        return this.styleClass;
    }

    set_style_class_name(name) {
        this.styleClass = name;
    }

    get_style() {
        return this.style;
    }

    set_style(style) {
        this.style = style;
    }
}

export const St = { Widget };

export class Button extends Widget {
    menu = null;
}

export const panel = {
    _rightBox: new Widget(),
    statusArea: { quickSettings: new Widget() },
};

export function addPanelItem(name, { visible = true } = {}) {
    const child = new Button();
    child.accessible_name = name;
    const container = new Widget();
    container.children = [child];
    container.visible = visible;
    panel._rightBox.children.push(container);
    panel._rightBox.emit("child-added", container);
    return { container, child };
}

export function resetPanel() {
    panel._rightBox = new Widget();
    panel.statusArea = { quickSettings: new Widget() };
    sources.clear();
}

export function fakeSettings(values = {}) {
    const store = new Map(Object.entries(values));
    const signals = new Signals();
    const read = (key) => {
        if (!store.has(key)) throw new Error(`Unset key ${key}`);
        return store.get(key);
    };
    const write = (key, value) => {
        store.set(key, value);
        signals.emit(`changed::${key}`);
    };
    return {
        get_boolean: read,
        get_int: read,
        get_string: read,
        get_strv: (key) => [...read(key)],
        set_boolean: write,
        set_int: write,
        set_string: write,
        set_strv: (key, value) => write(key, [...value]),
        reset: (key) => store.delete(key),
        connect: (signal, handler) => signals.connect(signal, handler),
        disconnect: (id) => signals.disconnect(id),
        connectObject: (signal, handler) => signals.connect(signal, handler),
        disconnectObject: () => signals.handlers.clear(),
        change: write,
        has: (key) => store.has(key),
        peek: (key) => store.get(key),
        signals,
    };
}
