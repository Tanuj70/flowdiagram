"""Check that the configs deploy.py would send are accepted by the installed Vertex AI SDK's own schema
(no network, no credentials):   python tools/validate_deploy_config.py <package_dir>"""
import importlib, os, sys, pathlib
pkg = pathlib.Path(sys.argv[1]).resolve(); sys.path.insert(0, str(pkg)); os.chdir(pkg)
import vertexai
from google.auth.credentials import AnonymousCredentials
vertexai.init(project="demo-project", location="us-central1", credentials=AnonymousCredentials())
from vertexai import agent_engines, types
deploy = importlib.import_module("deploy")
from agent import root_agent
C = deploy.CONFIG
Cfg = types.AgentEngineConfig

# sdk method (exactly as deploy.py builds it)
sdk = {"requirements": C["requirements"], "staging_bucket": "gs://bucket", "display_name": C["display_name"],
       "identity_type": types.IdentityType.AGENT_IDENTITY, "min_instances": C["min_instances"], "max_instances": C["max_instances"],
       "resource_limits": {"cpu": C["cpu"], "memory": C["memory"]}}
Cfg(**sdk); print("ok - sdk-method config accepted by AgentEngineConfig")

# container method
ops = agent_engines.AdkApp(agent=root_agent).register_operations()
ops.setdefault("async", []).append("query")
cm = [{"name": n, "api_mode": m} for m, names in ops.items() for n in names]
cont = {"container_spec": {"image_uri": C["image"]}, "class_methods": cm, "display_name": C["display_name"],
        "min_instances": C["min_instances"], "max_instances": C["max_instances"], "resource_limits": {"cpu": C["cpu"], "memory": C["memory"]}}
cfg = Cfg(**cont)
print("ok - container config accepted; class_methods:", [(c["name"], c["api_mode"]) for c in cm][:4], "...", len(cm), "total")
print("   image_uri:", cfg.container_spec.image_uri if hasattr(cfg.container_spec, "image_uri") else cfg.container_spec)
# make sure a bad key is actually rejected (so the check above means something)
try:
    Cfg(**{**cont, "container_specc": {}}); print("WARN - unknown keys are silently accepted (check is weaker than hoped)")
except Exception as e:
    print("ok - unknown keys are rejected (validation is real)")
