import React from "react";

const ROLE_TABS = {
    client: { label: "Client", to: "/" },
    astrologer: { label: "Astrologer", to: "/" },
};

/**
 * Renders exactly ONE tab based on role.
 * - client -> shows only "Client"
 * - astrologer -> shows only "Astrologer"
 * - invalid/undefined -> renders nothing
 */
export default function RoleTabs({ role, onClick }) {
    const tab = role ? ROLE_TABS[role] : null;
    if (!tab) return null;

    return (
        <div
            className="flex items-center rounded-xl p-1 gap-1"
            style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            aria-label="Role tabs"
        >
            <button
                type="button"
                onClick={() => onClick?.(tab)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold"
                style={{ background: "var(--gold)", color: "#0A0A0A" }}
                aria-current="page"
            >
                {tab.label}
            </button>
        </div>
    );
}

