import asciiExtraSpectrums from "../lib/ascii-extra-spectrums.txt?raw";

export function AsciiExtraSpectrums() {
  return <pre className="asciiTitle asciiTitleSection">{asciiExtraSpectrums.trimEnd()}</pre>;
}
