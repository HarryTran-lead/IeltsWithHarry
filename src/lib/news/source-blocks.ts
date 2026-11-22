/** Remove publisher promos and credits, without discarding short factual introductions. */
export function isPublisherBoilerplate(value:string){
  const text=value.replace(/\s+/g," ").trim();
  return text.length<1200&&/^(?:This (?:post|story|article) is part of (?:our|the|Global Voices[’']?)\b.{0,200}(?:special coverage|spotlight)|Support Global Voices\b|Donate (?:now|to Global Voices)\b|Please (?:consider )?(?:donating|supporting Global Voices)\b)/i.test(text)
    ||text.length<300&&/^(?:image|photo|video) credits?:\s/i.test(text);
}
