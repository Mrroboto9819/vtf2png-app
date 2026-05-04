import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

const els = {
  inputPath: document.getElementById("input-path"),
  outputPath: document.getElementById("output-path"),
  pickInput: document.getElementById("pick-input"),
  pickOutput: document.getElementById("pick-output"),
  convert: document.getElementById("convert"),
  status: document.getElementById("status"),
  version: document.getElementById("version"),
};

const state = {
  input: null,
  output: null,
};

function refreshConvertButton() {
  els.convert.disabled = !(state.input && state.output);
}

function setPath(target, path) {
  state[target] = path;
  const el = target === "input" ? els.inputPath : els.outputPath;
  if (path) {
    el.textContent = path;
    el.classList.remove("muted");
  } else {
    el.textContent = "No folder selected";
    el.classList.add("muted");
  }
  refreshConvertButton();
}

async function pickFolder(target) {
  const selected = await open({
    directory: true,
    multiple: false,
  });
  if (typeof selected === "string") {
    setPath(target, selected);
  }
}

els.pickInput.addEventListener("click", () => pickFolder("input"));
els.pickOutput.addEventListener("click", () => pickFolder("output"));

els.convert.addEventListener("click", () => {
  els.status.textContent = "Converter not implemented yet — coming next.";
});

invoke("app_info")
  .then((info) => {
    els.version.textContent = `${info.name} v${info.version}`;
  })
  .catch(() => {
    els.version.textContent = "";
  });
