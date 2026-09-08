"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.worldTickSchema = void 0;
exports.worldTickSchema = {
    type: "object",
    additionalProperties: false,
    required: [
        "characterConnections",
        "summary",
        "factionActions",
        "locationChanges",
        "worldEventChanges",
        "privateDevelopments",
        "publicDevelopments",
    ],
    properties: {
        characterConnections: { type: 'array', maxItems: 20, items: { type: 'object', additionalProperties: false,
                required: ['sourceName', 'targetName', 'relationshipType', 'status', 'private', 'reason', 'sentimentScore'], properties: {
                    sourceName: { type: 'string' }, targetName: { type: 'string' }, relationshipType: { type: 'string' }, status: { type: 'string', enum: ['active', 'former'] },
                    private: { type: 'boolean' }, reason: { type: 'string' }, sentimentScore: { type: ['integer', 'null'], minimum: -100, maximum: 100 }
                } } },
        summary: { type: "string" },
        factionActions: {
            type: "array",
            maxItems: 20,
            items: {
                type: "object",
                additionalProperties: false,
                required: [
                    "factionName",
                    "action",
                    "reason",
                    "timeRequired",
                    "outcome",
                ],
                properties: {
                    factionName: { type: "string" },
                    action: { type: "string" },
                    reason: { type: "string" },
                    timeRequired: { type: "string" },
                    outcome: { type: "string" },
                },
            },
        },
        locationChanges: {
            type: "array",
            maxItems: 20,
            items: {
                type: "object",
                additionalProperties: false,
                required: ["entityName", "locationName", "reason"],
                properties: {
                    entityName: { type: "string" },
                    locationName: { type: "string" },
                    reason: { type: "string" },
                },
            },
        },
        worldEventChanges: {
            type: "array",
            maxItems: 20,
            items: {
                type: "object",
                additionalProperties: false,
                required: ["eventKey", "status", "reason"],
                properties: {
                    eventKey: { type: "string" },
                    status: {
                        type: "string",
                        enum: [
                            "pending",
                            "triggered",
                            "prevented",
                            "altered",
                        ],
                    },
                    reason: { type: "string" },
                },
            },
        },
        privateDevelopments: {
            type: "array",
            maxItems: 20,
            items: { type: "string" },
        },
        publicDevelopments: {
            type: "array",
            maxItems: 12,
            items: { type: "string" },
        },
    },
};
