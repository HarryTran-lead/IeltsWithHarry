import { describe, expect, it } from "vitest";
import { s6MutationGuard } from "./mutation-guard";

const URL_="https://staging.invalid/api/speaking/s6/session";
const request=(headers:Record<string,string>,method="POST")=>new Request(URL_,{
  method,headers,body:method==="POST"?"{}":undefined
});
describe("M10-L25 cookie-write CSRF and JSON boundary",()=>{
 it("accepts an exact same-origin JSON browser request",()=>{
  expect(s6MutationGuard(request({"Origin":"https://staging.invalid",
    "Content-Type":"application/json; charset=utf-8","Sec-Fetch-Site":"same-origin"}))).toBeNull();
 });
 it("accepts browser-attested same-origin fetch without Origin",()=>{
  expect(s6MutationGuard(request({"Content-Type":"application/json",
    "Sec-Fetch-Site":"same-origin"}))).toBeNull();
 });
 it("rejects a cross-site origin even if JSON",()=>{
  const r=s6MutationGuard(request({"Origin":"https://attacker.invalid",
    "Content-Type":"application/json"}));
  expect(r?.status).toBe(403);
 });
 it("rejects same-site subdomains because they are not the same origin",()=>{
  const r=s6MutationGuard(request({"Origin":"https://sub.staging.invalid",
    "Content-Type":"application/json","Sec-Fetch-Site":"same-site"}));
  expect(r?.status).toBe(403);
 });
 it("rejects missing browser provenance and opaque/null origins",()=>{
  expect(s6MutationGuard(request({"Content-Type":"application/json"}))?.status).toBe(403);
  expect(s6MutationGuard(request({"Origin":"null","Content-Type":"application/json"}))?.status).toBe(403);
 });
 it("rejects multipart, text/plain, and HTML forms before any API body read",()=>{
  for(const type of ["text/plain","application/x-www-form-urlencoded","multipart/form-data"]){
    expect(s6MutationGuard(request({"Origin":"https://staging.invalid",
      "Content-Type":type}))?.status).toBe(415);
  }
 });
 it("rejects a non-Origin URL containing path/credentials even if hostname matches",()=>{
  expect(s6MutationGuard(request({"Origin":"https://staging.invalid/path",
    "Content-Type":"application/json"}))?.status).toBe(403);
  expect(s6MutationGuard(request({"Origin":"https://u:p@staging.invalid",
    "Content-Type":"application/json"}))?.status).toBe(403);
 });
 it("rejects explicit cross-site fetch metadata even with a matching Origin",()=>{
  expect(s6MutationGuard(request({"Origin":"https://staging.invalid",
    "Content-Type":"application/json","Sec-Fetch-Site":"cross-site"}))?.status).toBe(403);
 });
 it("allows same-origin DELETE without JSON but rejects missing Origin",()=>{
  expect(s6MutationGuard(request({"Origin":"https://staging.invalid"},"DELETE"),false)).toBeNull();
  expect(s6MutationGuard(request({},"DELETE"),false)?.status).toBe(403);
 });
});
