export default async function loadScript(sourceUrl: string) {
  const scriptResponse = await fetch(sourceUrl)
  const text = await scriptResponse.text()
  eval(text)
}