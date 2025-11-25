import dspy


class OtherSig(dspy.Signature):
    question = dspy.InputField()
    answer = dspy.OutputField()


class ExampleAgent:
    def __init__(self, config=None, **kwargs):
        self.predict = dspy.Predict(OtherSig)

    def forward(self, question: str) -> str:
        return self.predict(question=question)


class ExampleAgent2:
    def __init__(self, config=None, **kwargs):
        self.predict = dspy.Predict("question: str -> answer: str")

    def forward(self, question: str) -> str:
        return self.predict(question=question)
