import dspy


class MySignature(dspy.Signature):
    """
    This is a test signature.
    """

    name: str = dspy.InputField(description="The name of the person.")
    age: int = dspy.InputField(description="The age of the person.")
    city: str = dspy.InputField(description="The city of the person.")
    output: str = dspy.OutputField(description="The output of the signature.")


my_predict1 = dspy.Predict(MySignature)
result1 = my_predict1(name="John", age=30, city="New York")

result1.output


my_predict2 = dspy.Predict("name: str, age: int, city: str -> output: str")
result2 = my_predict2(name="John", age=30, city="New York")
result2.output


my_predict3 = dspy.Predict("name, age: int, city: str -> output: str, answer")
result3 = my_predict3(name="John", age=30, city="New York")
result3.output
