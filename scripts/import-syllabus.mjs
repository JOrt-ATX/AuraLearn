// One-off import: "Advanced AI Technologies" syllabus -> Course/Subject/Unit/Explanation.
// Run with the app server already running: node scripts/import-syllabus.mjs
const BASE = process.env.AURA_BASE_URL || 'http://localhost:8787';

async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${await res.text()}`);
  return res.json();
}

const syllabus = [
  { subject: '1. Transformer Theory & Architecture Variants', units: [
    { unit: '1.1 Attention mechanisms in depth', items: [
      ['Scaled dot-product attention', 'the QKV formulation and why the √d scaling keeps gradients stable.'],
      ['Multi-head, multi-query & grouped-query attention', 'how MQA/GQA trade head diversity for KV-cache savings.'],
      ['Flash attention', 'IO-aware exact attention that tiles work to avoid materializing the full attention matrix.'],
    ]},
    { unit: '1.2 Positional information', items: [
      ['Absolute vs rotary embeddings', 'why RoPE encodes relative position and extrapolates better.'],
      ['Context-length extension', 'NTK-aware scaling and YaRN to stretch a trained context window.'],
    ]},
    { unit: '1.3 Beyond dense transformers', items: [
      ['Mixture-of-Experts', 'sparse routing that grows parameter count without proportional compute.'],
      ['State-space models', 'Mamba/SSM linear-time alternatives to quadratic attention.'],
      ['Hybrid stacks', 'interleaving attention with SSM or recurrent blocks.'],
    ]},
  ]},
  { subject: '2. Model Formats, Quantization & Local Inference', units: [
    { unit: '2.1 Serialization formats', items: [
      ['safetensors vs pickle', 'why safetensors became the safe, zero-copy weight standard.'],
      ['GGUF', 'the single-file format carrying weights, tokenizer, and metadata for llama.cpp.'],
    ]},
    { unit: '2.2 Quantization theory', items: [
      ['Post-training quantization', 'GPTQ/AWQ and how they minimize layerwise reconstruction error.'],
      ['Quantization-aware training', 'QAT bakes low-precision robustness into training (e.g. Gemma QAT).'],
      ['GGUF quant types', 'what k-quants and i-quants (Q4_K_M, IQ4_XS…) actually trade off.'],
    ]},
    { unit: '2.3 Local inference engines', items: [
      ['llama.cpp', 'CPU/GPU hybrid inference with layer offloading.'],
      ['vLLM & paged attention', 'high-throughput serving via KV-cache paging.'],
      ['VRAM budgeting', 'estimating memory from parameters, precision, context, and KV cache.'],
    ]},
  ]},
  { subject: '3. Training, Fine-tuning & Alignment', units: [
    { unit: '3.1 The training pipeline', items: [
      ['Pretraining objectives', 'next-token prediction and data/compute scaling laws.'],
      ['Supervised fine-tuning', 'instruction tuning to shape format and task behavior.'],
    ]},
    { unit: '3.2 Preference optimization', items: [
      ['RLHF', 'reward modeling plus PPO to align with human preferences.'],
      ['DPO and variants', 'closed-form preference optimization that skips the explicit reward model.'],
      ['RLAIF & constitutional methods', 'using model-generated feedback to scale alignment.'],
    ]},
    { unit: '3.3 Parameter-efficient fine-tuning', items: [
      ['LoRA / QLoRA', 'low-rank adapters trained on top of a quantized base.'],
      ['Adapter merging', 'composing or stacking adapters, and where merging breaks down.'],
    ]},
  ]},
  { subject: '4. Reasoning & Test-Time Compute', units: [
    { unit: '4.1 Elicited reasoning', items: [
      ['Chain-of-thought', 'prompting intermediate steps to lift multi-step accuracy.'],
      ['Self-consistency & tree search', 'sampling or exploring multiple reasoning paths.'],
    ]},
    { unit: '4.2 Reasoning-trained models', items: [
      ['RL for reasoning', 'training long chains via verifiable rewards (o-series / R1-style).'],
      ['Test-time scaling', 'spending more inference compute to buy quality.'],
    ]},
  ]},
  { subject: '5. Retrieval-Augmented Generation & Knowledge Systems', units: [
    { unit: '5.1 Retrieval foundations', items: [
      ['Dense vs sparse retrieval', 'embeddings vs BM25 and hybrid fusion.'],
      ['Chunking & embedding strategy', 'how segmentation and embedding choice drive recall.'],
    ]},
    { unit: '5.2 Advanced RAG', items: [
      ['Reranking', 'cross-encoder rerankers that sharpen top-k precision.'],
      ['GraphRAG', 'graph-structured retrieval for multi-hop and global questions.'],
      ['Agentic / iterative retrieval', 'query rewriting and retrieve-reason loops.'],
    ]},
  ]},
  { subject: '6. Agentic Frameworks & Orchestration', units: [
    { unit: '6.1 Agent foundations', items: [
      ['ReAct loop', 'interleaving reasoning with tool calls.'],
      ['Tool / function calling', 'structured schemas the model fills to invoke external functions.'],
      ['Planning & reflection', 'task decomposition and self-critique patterns.'],
    ]},
    { unit: '6.2 Protocols & frameworks', items: [
      ['Model Context Protocol', 'open standard for wiring models to tools and data sources.'],
      ['Framework landscape', 'LangGraph and peers, and when orchestration libraries help vs hurt.'],
    ]},
    { unit: '6.3 Multi-agent systems', items: [
      ['Orchestrator-worker patterns', 'delegating subtasks to specialized agents.'],
      ['Failure modes', 'error compounding, context drift, and cost blowups.'],
    ]},
  ]},
  { subject: '7. Context Engineering & Structured Generation', units: [
    { unit: '7.1 Context management', items: [
      ['Context-window mechanics', 'attention cost, "lost in the middle," and budgeting.'],
      ['Context compaction', 'summarization and memory to sustain long-running tasks.'],
    ]},
    { unit: '7.2 Controlled output', items: [
      ['Constrained decoding', 'grammar- or JSON-schema-guided generation.'],
      ['Structured outputs', 'reliable typed responses for downstream code.'],
    ]},
  ]},
  { subject: '8. Multimodal AI', units: [
    { unit: '8.1 Vision-language', items: [
      ['VLM architecture', 'vision encoders projected into the LLM token space.'],
      ['Document & visual understanding', 'OCR-free parsing and visual grounding.'],
    ]},
    { unit: '8.2 Audio & speech', items: [
      ['Cascaded vs end-to-end speech', 'ASR/TTS pipelines vs native speech-to-speech models.'],
    ]},
  ]},
  { subject: '9. Inference Optimization & Serving', units: [
    { unit: '9.1 Decoding acceleration', items: [
      ['KV cache', 'caching past keys/values and the memory cost it incurs.'],
      ['Speculative decoding', 'draft-and-verify to cut latency.'],
      ['Multi-token prediction', 'predicting several tokens per step (your MTP work).'],
    ]},
    { unit: '9.2 Throughput', items: [
      ['Continuous batching', 'packing requests to keep the GPU saturated.'],
      ['Quantized serving', 'running low-precision weights at scale.'],
    ]},
  ]},
  { subject: '10. Evaluation, Safety & Governance', units: [
    { unit: '10.1 Evaluation', items: [
      ['Benchmarks & contamination', 'what leaderboards measure and where they mislead.'],
      ['LLM-as-judge', 'using models to grade outputs, and its known biases.'],
      ['Observability', 'tracing, eval harnesses, and regression testing.'],
    ]},
    { unit: '10.2 Safety & interpretability', items: [
      ['Red-teaming & jailbreaks', 'adversarial testing of guardrails.'],
      ['Mechanistic interpretability', 'features, circuits, and sparse autoencoders.'],
    ]},
    { unit: '10.3 Governance', items: [
      ['EU AI Act', 'risk tiers and provider/deployer obligations.'],
      ['Data sovereignty', 'on-prem / air-gapped constraints and compliance.'],
    ]},
  ]},
];

async function main() {
  const course = await req('POST', '/api/courses', { name: 'Advanced AI Technologies' });
  console.log('Course created:', course.id);

  let subjectCount = 0, unitCount = 0, explanationCount = 0;

  for (const s of syllabus) {
    const subject = await req('POST', '/api/subjects', { courseId: course.id, name: s.subject });
    subjectCount++;
    for (const u of s.units) {
      const unit = await req('POST', '/api/units', { subjectId: subject.id, name: u.unit });
      unitCount++;
      for (const [title, desc] of u.items) {
        await req('POST', `/api/units/${unit.id}/explanations`, { prompt: title, content: desc });
        explanationCount++;
      }
    }
  }

  console.log(`Done. Subjects: ${subjectCount}, Units: ${unitCount}, Explanations: ${explanationCount}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
