import Adw from "gi://Adw";
import Gdk from "gi://Gdk";
import type Gio from "gi://Gio";
import GObject from "gi://GObject";
import Gtk from "gi://Gtk";
import type { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";
import { Icons } from "../lib/icons.js";
import { getTemplate } from "../utils/getTemplate.js";

const LICENSE = `MIT License

Copyright (c) 2025 Dagim G. Astatkie

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

export const AboutPage = GObject.registerClass(
    {
        GTypeName: "VeilAboutPage",
        Template: getTemplate("AboutPage"),
        InternalChildren: [
            "extensionIcon",
            "extensionName",
            "extensionVersion",
            "linkWebsite",
            "linkIssues",
            "legalRow",
            "extensionLicense",
        ],
    },
    class AboutPage extends Adw.PreferencesPage {
        declare _extensionIcon: Gtk.Image;
        declare _extensionName: Gtk.Label;
        declare _extensionVersion: Gtk.Label;
        declare _linkWebsite: Gtk.Button;
        declare _linkIssues: Gtk.Button;
        declare _legalRow: Adw.ExpanderRow;
        declare _extensionLicense: Gtk.TextView;

        setMetadata(metadata: ExtensionPreferences["metadata"]) {
            new Icons(metadata.path);

            const veilIcon = Icons.get("arrow-close") as Gio.Icon;

            this._extensionIcon.set_from_gicon(veilIcon);

            this._extensionName.set_text(metadata.name);
            this._extensionVersion.set_text(
                `v${metadata["version-name"] || metadata.version}${__VICINAE_ENV_SUFFIX__ ?? ""}`,
            );

            if (metadata.url) {
                this._linkWebsite.connect("clicked", () => {
                    Gtk.show_uri(null, metadata.url || "", Gdk.CURRENT_TIME);
                });
                this._linkIssues.connect("clicked", () => {
                    Gtk.show_uri(
                        null,
                        `${metadata.url}/issues`,
                        Gdk.CURRENT_TIME,
                    );
                });
            } else {
                this._linkWebsite.visible = false;
                this._linkIssues.visible = false;
            }

            this._extensionLicense.buffer.set_text(LICENSE, -1);
        }
    },
);
