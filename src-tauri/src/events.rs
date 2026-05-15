use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

/// Mirrors the TS schema in src/sim/events/EventSchema.ts.
/// We default many fields server-side so ambient sources can produce events
/// without having to know the full envelope.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KingdomEvent {
    pub v: u32,
    pub id: String,
    pub ts: u64,
    pub kind: String,
    pub source: String,
    pub intensity: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
    pub payload: EventPayload,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EventPayload {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub structure: Option<String>,
    #[serde(skip_serializing_if = "HashMap::is_empty", default)]
    pub meta: HashMap<String, serde_json::Value>,
}

impl KingdomEvent {
    pub fn new(kind: &str, source: &str) -> Self {
        Self {
            v: 1,
            id: Uuid::new_v4().to_string(),
            ts: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0),
            kind: kind.to_string(),
            source: source.to_string(),
            intensity: 0.5,
            duration_ms: None,
            payload: EventPayload::default(),
        }
    }

    pub fn intensity(mut self, i: f32) -> Self {
        self.intensity = i.clamp(0.0, 1.0);
        self
    }

    pub fn duration(mut self, ms: u64) -> Self {
        self.duration_ms = Some(ms);
        self
    }

    pub fn label(mut self, l: impl Into<String>) -> Self {
        self.payload.label = Some(l.into());
        self
    }

    pub fn from_to(mut self, from: impl Into<String>, to: impl Into<String>) -> Self {
        self.payload.from = Some(from.into());
        self.payload.to = Some(to.into());
        self
    }

    pub fn structure(mut self, s: impl Into<String>) -> Self {
        self.payload.structure = Some(s.into());
        self
    }
}
