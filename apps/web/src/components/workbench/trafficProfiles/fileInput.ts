export function firstFileFromList(fileList: FileList | null) {
  return fileList?.item?.(0) ?? fileList?.[0] ?? null;
}

export function resetFileInput(input: HTMLInputElement | null | undefined) {
  if (input) {
    input.value = "";
  }
}

export function readTextFile(file: File) {
  if (typeof file.text === "function") {
    return file.text();
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("file read failed"));
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsText(file);
  });
}
