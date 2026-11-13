import unittest

from bal_engine_worker import (
    EngineExecutionContext,
    EngineRegistry,
    EngineResult,
    RegistryError,
)


class DemoEngine:
    engine_code = "demo.echo"
    engine_version = "1.0.0"

    def execute(self, context, payload):
        return EngineResult(
            status="succeeded",
            data={"echo": payload["value"], "job_id": context.job_id},
            provenance={"engine": self.engine_code, "version": self.engine_version},
        )


class BrokenEngine:
    engine_code = "demo.broken"
    engine_version = "1.0.0"

    def execute(self, context, payload):
        raise RuntimeError("engine failure is isolated by the worker boundary")


class EngineRegistryTests(unittest.TestCase):
    def setUp(self):
        self.registry = EngineRegistry()
        self.context = EngineExecutionContext(
            job_id="job-001",
            organization_id="org-001",
            attempt_number=1,
        )

    def test_register_resolve_and_execute_exact_version(self):
        engine = DemoEngine()
        self.registry.register(engine)

        result = self.registry.execute(
            "demo.echo",
            "1.0.0",
            self.context,
            {"value": "cultureops"},
        )

        self.assertEqual(result.data["echo"], "cultureops")
        self.assertEqual(result.data["job_id"], "job-001")
        self.assertEqual(self.registry.registered(), (("demo.echo", "1.0.0"),))

    def test_duplicate_registration_is_rejected(self):
        self.registry.register(DemoEngine())
        with self.assertRaises(RegistryError):
            self.registry.register(DemoEngine())

    def test_unknown_version_does_not_fall_back_to_latest(self):
        self.registry.register(DemoEngine())
        with self.assertRaises(RegistryError):
            self.registry.resolve("demo.echo", "latest")

    def test_non_mapping_payload_is_rejected_before_engine_call(self):
        self.registry.register(DemoEngine())
        with self.assertRaises(TypeError):
            self.registry.execute("demo.echo", "1.0.0", self.context, ["not", "an", "object"])

    def test_engine_exception_propagates_to_worker_boundary(self):
        self.registry.register(BrokenEngine())
        with self.assertRaisesRegex(RuntimeError, "engine failure"):
            self.registry.execute("demo.broken", "1.0.0", self.context, {})

    def test_engine_result_rejects_non_json_values(self):
        with self.assertRaisesRegex(TypeError, "JSON-serializable"):
            EngineResult(status="succeeded", data={"bad": object()})
        with self.assertRaisesRegex(TypeError, "JSON-serializable"):
            EngineResult(status="succeeded", provenance={"not_finite": float("nan")})

    def test_invalid_engine_result_is_rejected(self):
        class InvalidEngine:
            engine_code = "demo.invalid"
            engine_version = "1.0.0"

            def execute(self, context, payload):
                return {"status": "succeeded"}

        self.registry.register(InvalidEngine())
        with self.assertRaises(TypeError):
            self.registry.execute("demo.invalid", "1.0.0", self.context, {})


if __name__ == "__main__":
    unittest.main()
