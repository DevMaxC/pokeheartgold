from pathlib import Path
import subprocess,tarfile,io,json,hashlib,re,shutil,datetime
repo=Path('/Users/maxchurch/Documents/pokeheartgold-native-battle-obedience')
review=Path('/tmp/hg-native-obedience-review-da88fecc-20261017')
review.mkdir(exist_ok=True)
commit=subprocess.check_output(['git','rev-parse','da88fecc'],cwd=repo,text=True).strip()
paths=['browser/src','browser/package.json','browser/package-lock.json','browser/tsconfig.json','src','asm','include','files/battledata/script']
data_paths=subprocess.check_output(['git','ls-tree','-r','--name-only',commit,'browser/public/source'],cwd=repo,text=True).splitlines()
paths += [p for p in data_paths if (p.count('/')==3 and p.endswith('.json')) or p=='browser/public/source/messages/302.json']
paths += ['browser/reviews/native-battle-obedience/source/battle-math-before-54787.ts.txt']
archive=subprocess.check_output(['git','archive',commit,*paths],cwd=repo)
with tarfile.open(fileobj=io.BytesIO(archive)) as tf: tf.extractall(review,filter='data')
# Keep accepted ownership dependency evidence pinned to its independent commit.
evidence_prefix='browser/reviews/native-npc-trade/core-and-owner-reviews'
archive=subprocess.check_output(['git','archive','956099e4',evidence_prefix],cwd=repo)
with tarfile.open(fileobj=io.BytesIO(archive)) as tf: tf.extractall(review,filter='data')
(review/'changes.patch').write_bytes(subprocess.check_output(['git','diff','54787f84',commit,'--','browser/src/source/battle.ts','browser/src/source/battle-math.ts','browser/src/source/battle-obedience.ts','browser/src/source/battle-obedience.test.ts','browser/src/source/battle-obedience-integration.test.ts','browser/src/source/mon-ownership.ts'],cwd=repo))
for revision,name in [('54787f84','battle-before-54787.ts'),('54787f84','battle-math-before-54787.ts')]:
 p='browser/src/source/'+name.replace('-before-54787','')
 dest=review/'prior-source'/name;dest.parent.mkdir(exist_ok=True);dest.write_bytes(subprocess.check_output(['git','show',revision+':'+p],cwd=repo))
checks=review/'checks';checks.mkdir(exist_ok=True)
for name in ['hg-obedience-final-freeze-tests.log','hg-obedience-final-freeze-tsc.log','hg-obedience-five-findings-before.log','hg-obedience-five-findings-after.log','hg-obedience-volatiles-fully-materialized.log']:
 shutil.copyfile(Path('/tmp')/name,checks/name)
shutil.copytree('/Users/maxchurch/Documents/pokeheartgold-review-artifacts/native-battle-obedience-before-findings',review/'prior-findings',dirs_exist_ok=True)
# Complete all copied TS relative import references, including auxiliary test helpers.
for generation in range(10):
 added=0
 for f in list(review.rglob('*.ts')):
  refs=re.findall(r'''(?m)^(?:import|export)\b[^\n]*?['\"](\.[^'\"\n]+)['\"]''',f.read_text())+re.findall(r'''\bimport\(['\"](\.[^'\"\n]+)['\"]\)''',f.read_text())
  for ref in refs:
   dest=(f.parent/ref).resolve()
   if dest.exists() or dest.suffix not in ['.ts','.json']:continue
   rel=dest.relative_to(review.resolve()).as_posix()
   content=subprocess.run(['git','show',commit+':'+rel],cwd=repo,capture_output=True)
   if content.returncode:continue
   dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(content.stdout);added+=1
 if not added:break
# Pin complete relative TS import graph; all browser source copied, no executable symlinks.
graph={};missing=[]
for f in sorted((review/'browser/src').rglob('*.ts')):
 refs=re.findall(r'''(?m)^(?:import|export)\b[^\n]*?['\"](\.[^'\"\n]+)['\"]''',f.read_text()) + re.findall(r'''\bimport\(['\"](\.[^'\"\n]+)['\"]\)''',f.read_text())
 targets=[]
 for ref in refs:
  dest=(f.parent/ref).resolve()
  if dest.is_file():targets.append(dest.relative_to(review.resolve()).as_posix())
  elif dest.suffix in ['.ts','.json']:missing.append({'source':f.relative_to(review).as_posix(),'reference':ref})
 graph[f.relative_to(review).as_posix()]=targets
(review/'dependency-graph.json').write_text(json.dumps({'sourceImports':graph,'missingRelativeImports':missing,'nonRelativeDependencies':'Package/lock pins provided. Reviewer has no shell/build/browser/network; runtime renderer is out of scope.'},indent=2)+'\n')
(review/'integration.txt').write_text('''Frozen scoped obedience review.\nRuntime commit da88feccfa4e0f8bcf02ae6e38b659b671758b9c on54787f84 plus ownership aliases2c921254/ff337749. Ownership helper is byte-identical to accepted15fd5655 source SHA2561cf816360b2c7ace41116acbd5cf03cd4e2062f0443a9dcb2e38c78fd30939a7; independent accepted owner-f1 raw result and prior core review are preserved from evidence956099e4.\nScope: NEW battle-obedience kernel +actual Battle.attack integration +selfHitDamage extraction/new POUND disobedienceDamage; accepted OT helper compatibility is contextual dependency, no EXP integration in this leaf. Full relative TS import graph and original native src/asm/include/battle scripts are copied from exact Git objects. Public sourceJSON inputs include exact source302 text.\nRoot reports final107 affected tests pass,0fail/skip/cancel, plus TSCexit0. Logs are copied immutable; reviewer is not asked to rerun them. C oracle tests extract actual TryDisobedience2648cases, actual Technician/power248cases; fullu16 message selector;12096 accepted confusion comparisons with prior source. These checks are finite arithmetic/source evidence, not battle/browser/hardware parity proof.\nPreliminary audit found4 concrete issues and Root independently added fifth nap scope guard. Frozen delta addresses POUND Technician vs confusionSTRUGGLE, ret3 no ordinary berry recovery (skip31), RANGE_FRONT alternate target/a4=1 explicit unsupported MeFirst/no-target case, unrepresented Intimidate/Trace Attack provenance, nap BadDreams/status/weather prerequisites before status/duration/Rage mutation. Inspect independently; old-fail/new-pass logs and original pre-fix files are context, NOT approval.\nCurrent host intentionally singles only; no link/frontier/AIpartner/doubles/locked/Bide/Uproar producers. Sleeping Snore/SleepTalk effects remain rejected explicitly; kernel asleep outcome is not host admission. Move restriction producers Disable/Torment/Taunt/Encore/Imprison/Gravity/HealBlock/Choice are not admitted; callback represented mask onlyempty/PP slots plus item-scope rejection. Legacy missingOT identity remains explicit player-owned compatibility. Browser free-text Unicode name policy is explicitly separate from native keyboard/character unit parity.\nNo source files may be edited. No execution/build/browser/network/toolsoutsideReadGrepGlob. Report concrete reachable final-delta defects with exactsource/lines, not unrelated inherited whole-engine gaps. If none, qualify as scoped offline source-contract review only, not fullbattle/fullcampaign/browser/hardware approval.\n''')
prompt='''Perform an actual independent read-only review of the FROZEN scoped original traded-Pokemon obedience implementation. Read integration.txt, changes.patch, and exact runtime and tests; source native TryDisobedience is src/battle/battle_controller_player.c1879+, its TryMove caller2663+, native0254..258/0018 scripts, CalcMoveDamage/ApplyDamageRange, GetMoveTarget and controller34..40/AfterMoveItems, OT helpers and native string/profile routines. Complete copied source/dependency graph is available. Context evidence is not approval and test passes do not replace reasoning.\nFocus reachable behavioral errors: ordering of existing status checks before obedience, PP and replacement-slot handling, status/Rage/history for ret1/2/3, technician Pound-vs-Struggle damage identity, native per-controller held item/ability phases and pending opponent actions, alternate target and dead-target semantics, actual native source-known fullOT identity vs explicit legacy/free-text compatibility, deterministic RNG count/bounds, mutation-before-unsupported failures/rollback scope. Review all scoped source changes against original. Prior-source contains base Battle and unchanged confusion formula for regression comparison. Prior fixes explicitly tested but do not assume correctness.\nRoot reports107 affectedtests/TSCpass; original compiledCoracle2648decisioncases/248Technician branchcases, fullu16 messagecases/12096oldconfusioncomparisons. Read tests for blindspots. Do not execute anything. Only Read/Grep/Glob within this snapshot. Do not edit anyfile, invoke shell/build/browser/network/subagents, or read outside it. Snore/SleepTalk, locked/Bide/Uproar/double/link and broader unimplemented producers are explicitly unsupported; do not demand general engine redesign or treat inherited untouched gaps as newly introduced without a concrete final-delta reachability argument. You may flag an unguarded newly opened unsupported path if source-backed.\nReturn severity, exact file:line, trigger/consequence, original source proof and narrow practical fix for confirmed findings. Distinguish conditional/unreachable observations and limitations from bugs. If no confirmed defects remain, explicitly qualify acceptance as this scoped offline source/controller contract only, never browser/audio/3D/fullbattle/campaign/GX/hardware approval. Preserve all conclusions in the returned result; no writes. Max60turns.'''
(review/'prompt.txt').write_text(prompt+'\n')
cmd=['/Users/maxchurch/.local/bin/claude','-p','--model','claude-opus-5-5','--tools','Read,Grep,Glob','--allowedTools','Read,Grep,Glob','--permission-mode','dontAsk','--restricted','--setting-sources','','--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--output-format','json','--no-session-persistence','--disable-slash-commands','--max-turns','60']
(review/'command.json').write_text(json.dumps(cmd,indent=2)+'\n')
files=[]
for f in sorted(review.rglob('*')):
 if f.is_file() and f.name!='input-manifest.json':files.append({'path':f.relative_to(review).as_posix(),'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()})
manifest={'createdUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceRepository':str(repo),'sourceCommit':commit,'nativeAndBrowserSourceOrigin':'exact git archive of same frozen commit; no mutable working-tree files/symlinks','ownershipEvidenceCommit':'956099e4','files':files}
(review/'input-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'review':str(review),'inputs':len(files),'bytes':sum(f['bytes'] for f in files),'missingRelativeImports':missing},indent=2))
